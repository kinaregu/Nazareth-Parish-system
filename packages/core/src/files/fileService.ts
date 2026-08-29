/**
 * @nazareth/core — secure file storage.
 *
 * Files are stored OUTSIDE the public web root (.data/files) with random
 * stored names. There is NO public URL scheme: the only way to read a file
 * is the authenticated endpoint /api/v1/files/:id/download, which re-checks
 * permissions + ownership on every request (private files default).
 */
import { mkdir, writeFile, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { query, queryOne } from '@nazareth/db';
import { ApiError } from '../errors';
import { config } from '../config';
import { hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export async function saveFile(scope: AccessScope, input: {
  buffer: Buffer; mime: string; originalName: string; kind: string;
  entityType?: string; entityId?: string; branchId?: string;
}): Promise<any> {
  if (!config.fileAllowedMimes.includes(input.mime)) {
    throw ApiError.validation(`File type not allowed. Accepted: ${config.fileAllowedMimes.join(', ')}`);
  }
  const maxBytes = config.fileMaxSizeMb * 1024 * 1024;
  if (input.buffer.length > maxBytes) {
    throw ApiError.validation(`File too large. Maximum size is ${config.fileMaxSizeMb} MB.`);
  }
  const ext = EXT_BY_MIME[input.mime];
  if (!ext) throw ApiError.validation('File type not allowed.');
  const dir = path.resolve(config.fileStoragePath, scope.orgId);
  await mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, storedName), input.buffer);

  const f = await queryOne<any>(
    `INSERT INTO files (org_id, branch_id, kind, original_name, stored_name, mime, size_bytes, uploader_id, entity_type, entity_id, is_private)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING *`,
    [scope.orgId, input.branchId ?? scope.branchId, input.kind, path.basename(input.originalName), storedName,
     input.mime, input.buffer.length, scope.userId, input.entityType ?? null, input.entityId ?? null],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'file.upload', entity: 'file', entityId: f.id, metadata: { kind: input.kind, name: input.originalName, size: input.buffer.length } });
  return f;
}

/**
 * Ownership rules for download:
 *  - files.manage holders (admins)
 *  - uploader
 *  - entity-linked: the member themselves (member_document/avatar) or holders
 *    of the permission implied by the file kind (pastoral files → pastoral.view)
 */
async function canAccessFile(scope: AccessScope, f: any): Promise<boolean> {
  if (scope.isSuper || hasPermission(scope, 'files.manage')) return true;
  if (f.uploader_id === scope.userId) return true;
  if (f.entity_type === 'member' && f.entity_id === scope.linkedMemberId) return true;
  if (f.entity_type === 'user' && f.entity_id === scope.userId) return true;
  if (f.kind === 'pastoral' && hasPermission(scope, 'pastoral.view')) return true;
  if (f.kind === 'expense_receipt' && hasPermission(scope, 'expenses.view')) return true;
  return false;
}

export async function downloadFile(scope: AccessScope, id: string, ip?: string) {
  const f = await queryOne<any>('SELECT * FROM files WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL', [id, scope.orgId]);
  if (!f) throw ApiError.notFound('File not found.');
  if (!await canAccessFile(scope, f)) throw ApiError.forbidden('You do not have access to this file.');
  if (f.kind === 'pastoral') {
    await audit({ userId: scope.userId, orgId: scope.orgId, action: 'file.download_pastoral', entity: 'file', entityId: id, ip, metadata: { name: f.original_name } });
  }
  const p = path.join(config.fileStoragePath, scope.orgId, f.stored_name);
  try {
    const buf = await readFile(p);
    return { buffer: buf, mime: f.mime, name: f.original_name };
  } catch {
    throw ApiError.notFound('File data is missing on disk.');
  }
}

export async function listFiles(scope: AccessScope, opts: { kind?: string; entityId?: string; page: number; pageSize: number }) {
  if (!hasPermission(scope, 'files.manage') && !scope.isSuper) throw ApiError.forbidden();
  const where = ['f.deleted_at IS NULL', 'f.org_id = $1'];
  const params: unknown[] = [scope.orgId];
  if (opts.kind) { params.push(opts.kind); where.push(`f.kind = $${params.length}`); }
  if (opts.entityId) { params.push(opts.entityId); where.push(`f.entity_id = $${params.length}`); }
  const fullWhere = `WHERE ${where.join(' AND ')}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM files f ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT f.id, f.kind, f.original_name, f.mime, f.size_bytes, f.entity_type, f.entity_id,
            u.name AS uploader_name, f.created_at
       FROM files f LEFT JOIN users u ON u.id = f.uploader_id
      ${fullWhere} ORDER BY f.created_at DESC LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function deleteFile(scope: AccessScope, id: string, ip?: string) {
  if (!hasPermission(scope, 'files.manage') && !scope.isSuper) throw ApiError.forbidden();
  const f = await queryOne<any>('SELECT * FROM files WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL', [id, scope.orgId]);
  if (!f) throw ApiError.notFound();
  await query('UPDATE files SET deleted_at = now() WHERE id = $1', [id]);
  await unlink(path.join(config.fileStoragePath, scope.orgId, f.stored_name)).catch(() => {});
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'file.delete', entity: 'file', entityId: id, ip, metadata: { name: f.original_name } });
  return { id };
}
