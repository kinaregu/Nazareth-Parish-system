/**
 * @nazareth/core — audit logging.
 *
 * Append-only (no UPDATE/DELETE paths anywhere in the app). Every sensitive
 * action — logins, record changes, financial operations, permission changes,
 * pastoral record access, exports — is recorded here.
 */
import { query } from '@nazareth/db';

export interface AuditEntry {
  userId: string | null;
  orgId?: string | null;
  action: string; // e.g. 'member.update', 'auth.login', 'pastoral.case.view'
  entity: string; // e.g. 'member', 'user', 'giving_transaction'
  entityId?: string | null;
  branchId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (org_id, user_id, ip, user_agent, action, entity, entity_id, branch_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.orgId ?? null,
        entry.userId,
        entry.ip ?? null,
        entry.userAgent ?? null,
        entry.action,
        entry.entity,
        entry.entityId ?? null,
        entry.branchId ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ],
    );
  } catch (err) {
    // Audit failures must not break the main operation, but must be visible.
    console.error('[audit] failed to write log:', err);
  }
}

export async function listAuditLogs(opts: {
  page: number;
  pageSize: number;
  action?: string;
  entity?: string;
  userId?: string;
  from?: string;
  to?: string;
  search?: string;
}): Promise<{ data: any[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.action) { params.push(opts.action); where.push(`action ILIKE $${params.length}`); }
  if (opts.entity) { params.push(opts.entity); where.push(`entity = $${params.length}`); }
  if (opts.userId) { params.push(opts.userId); where.push(`user_id = $${params.length}`); }
  if (opts.from) { params.push(opts.from); where.push(`created_at >= $${params.length}::timestamptz`); }
  if (opts.to) { params.push(opts.to); where.push(`created_at <= $${params.length}::timestamptz`); }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(metadata::text ILIKE $${params.length} OR entity_id ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await query<any>(`SELECT COUNT(*)::int AS c FROM audit_logs ${whereSql}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT al.*, u.name AS user_name, u.email AS user_email
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
       ${whereSql}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  const totalPages = Math.max(1, Math.ceil(total[0].c / opts.pageSize));
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total[0].c, totalPages } };
}
