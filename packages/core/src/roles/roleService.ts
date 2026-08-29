/**
 * @nazareth/core — roles & permissions administration.
 * Permission changes are audit-logged (who granted what, when — §67).
 */
import { query, queryOne } from '@nazareth/db';
import { ApiError } from '../errors';
import { hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { PERMISSIONS } from '@nazareth/shared';

function requireRolesAdmin(scope: AccessScope) {
  if (!hasPermission(scope, 'roles.manage') && !scope.isSuper) throw ApiError.forbidden();
}

export async function listRoles(scope: AccessScope) {
  requireRolesAdmin(scope);
  const roles = await query<any>(
    `SELECT r.id, r.code, r.name, r.description, r.is_system,
            (SELECT COUNT(*)::int FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
       FROM roles r WHERE r.org_id = $1 AND r.deleted_at IS NULL ORDER BY r.name`,
    [scope.orgId],
  );
  const permRows = await query<any>(
    `SELECT rp.role_id, p.code, p.label
       FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id IN (SELECT id FROM roles WHERE org_id = $1)`,
    [scope.orgId],
  );
  const byRole = new Map<string, { code: string; label: string }[]>();
  permRows.forEach((p) => {
    const arr = byRole.get(p.role_id) ?? [];
    arr.push({ code: p.code, label: p.label });
    byRole.set(p.role_id, arr);
  });
  return roles.map((r) => ({ ...r, permissions: byRole.get(r.id) ?? [] }));
}

export async function listPermissions(scope: AccessScope) {
  requireRolesAdmin(scope);
  return query<any>('SELECT * FROM permissions ORDER BY module, label');
}

export async function createRole(scope: AccessScope, input: { code: string; name: string; description?: string; permission_codes: string[] }, ip?: string) {
  requireRolesAdmin(scope);
  const existing = await queryOne('SELECT id FROM roles WHERE org_id = $1 AND code = $2', [scope.orgId, input.code]);
  if (existing) throw ApiError.conflict('A role with this code already exists.');
  const perms = await query<any>('SELECT id FROM permissions WHERE code = ANY($1::text[])', [input.permission_codes]);
  const role = await queryOne<any>(
    'INSERT INTO roles (org_id, code, name, description) VALUES ($1,$2,$3,$4) RETURNING *',
    [scope.orgId, input.code, input.name, input.description ?? null],
  );
  for (const p of perms) {
    await query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [role.id, p.id]);
  }
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'role.create', entity: 'role', entityId: role.id, ip, metadata: { code: input.code, permissions: input.permission_codes } });
  return role;
}

export async function updateRole(scope: AccessScope, id: string, input: { name?: string; description?: string; permission_codes?: string[] }, ip?: string) {
  requireRolesAdmin(scope);
  const role = await queryOne<any>('SELECT * FROM roles WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL', [id, scope.orgId]);
  if (!role) throw ApiError.notFound('Role not found.');
  if (role.code === 'super_admin' && input.name !== undefined) throw ApiError.conflict('The super admin role cannot be renamed.');

  const before = (await query<any>('SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1', [id])).map((r) => r.code);

  if (input.name !== undefined || input.description !== undefined) {
    await queryOne<any>('UPDATE roles SET name = COALESCE($2, name), description = COALESCE($3, description) WHERE id = $1 RETURNING id',
      [id, input.name ?? null, input.description ?? null]);
  }
  if (input.permission_codes) {
    const codes = input.permission_codes;
    if (role.is_system && role.code !== 'super_admin') {
      // System roles: only ADDITIONS allowed (removing permissions can lock out churches).
      const removable = before.filter((c) => !codes.includes(c));
      const addable = codes.filter((c) => !before.includes(c));
      const rem = await query<any>('SELECT id, code FROM permissions WHERE code = ANY($1::text[])', [removable]);
      const add = await query<any>('SELECT id, code FROM permissions WHERE code = ANY($1::text[])', [addable]);
      for (const p of rem) await query('DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2', [id, p.id]);
      for (const p of add) await query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, p.id]);
      if (removable.length || addable.length) {
        await audit({ userId: scope.userId, orgId: scope.orgId, action: 'role.permissions_changed', entity: 'role', entityId: id, ip, metadata: { role: role.code, added: addable, removed: removable } });
      }
    } else if (!role.is_system) {
      await query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      const perms = await query<any>('SELECT id FROM permissions WHERE code = ANY($1::text[])', [input.permission_codes]);
      for (const p of perms) await query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, p.id]);
      await audit({ userId: scope.userId, orgId: scope.orgId, action: 'role.permissions_changed', entity: 'role', entityId: id, ip, metadata: { role: role.code, before, after: input.permission_codes } });
    }
  }
  return listRoles(scope);
}

export async function archiveRole(scope: AccessScope, id: string, ip?: string) {
  requireRolesAdmin(scope);
  const role = await queryOne<any>('SELECT * FROM roles WHERE id = $1 AND org_id = $2', [id, scope.orgId]);
  if (!role) throw ApiError.notFound();
  if (role.is_system) throw ApiError.conflict('System roles cannot be deleted.');
  const inUse = await queryOne<any>('SELECT COUNT(*)::int AS c FROM user_roles WHERE role_id = $1', [id]);
  if (inUse.c > 0) throw ApiError.conflict('This role is assigned to users. Remove the assignments first.');
  await query('UPDATE roles SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'role.delete', entity: 'role', entityId: id, ip, metadata: { code: role.code } });
  return { id };
}

/** Ensure a new permission code exists in the catalog (idempotent). */
export async function syncPermissionCatalog(scope: AccessScope): Promise<number> {
  let added = 0;
  for (const p of PERMISSIONS) {
    const r = await query<any>(
      `INSERT INTO permissions (code, label, module, description) VALUES ($1,$2,$3,$4)
        ON CONFLICT (code) DO NOTHING RETURNING id`,
      [p.code, p.label, p.module, p.description ?? null],
    );
    if (r.length > 0) added++;
  }
  return added;
}
