/**
 * @nazareth/core — pastoral care (HIGHLY RESTRICTED).
 *
 * Access: requires pastoral.view / pastoral.manage (default: pastor + super
 * admin only). Every READ of a case is audit-logged (pastoral.case.view),
 * per §67 auditability. Notes are append-only.
 */
import { query, queryOne } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';

function requireView(scope: AccessScope) {
  if (!hasPermission(scope, 'pastoral.view') && !scope.isSuper) {
    throw ApiError.forbidden('Pastoral care records are restricted. You do not have access.');
  }
}
function requireManage(scope: AccessScope) {
  if (!hasPermission(scope, 'pastoral.manage') && !scope.isSuper) {
    throw ApiError.forbidden('You do not have permission to manage pastoral care records.');
  }
}

export async function listCases(scope: AccessScope, opts: { status?: string; member_id?: string; page: number; pageSize: number }) {
  requireView(scope);
  const [sw, sp] = branchScopeWhere(scope, 'c.branch_id');
  const where = ['c.deleted_at IS NULL'];
  const params: unknown[] = [...sp];
  if (opts.status) { params.push(opts.status); where.push(`c.status = $${params.length}`); }
  if (opts.member_id) { params.push(opts.member_id); where.push(`c.member_id = $${params.length}`); }
  const fullWhere = `WHERE ${where.join(' AND ')}${sw}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM pastoral_cases c ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT c.*, m.first_name || ' ' || COALESCE(m.middle_name || '', '') || ' ' || m.last_name AS member_name,
            m.member_no, u.name AS assigned_to_name
       FROM pastoral_cases c
       JOIN members m ON m.id = c.member_id
       LEFT JOIN users u ON u.id = c.assigned_to
      ${fullWhere} ORDER BY c.opened_at DESC LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function getCase(scope: AccessScope, id: string, ip?: string) {
  requireView(scope);
  const [sw0, sp] = branchScopeWhere(scope, 'c.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const c = await queryOne<any>(
    `SELECT c.*, m.first_name, m.last_name, m.member_no, m.email AS member_email, m.phone AS member_phone,
            u.name AS assigned_to_name, b.name AS branch_name
       FROM pastoral_cases c
       JOIN members m ON m.id = c.member_id
       LEFT JOIN users u ON u.id = c.assigned_to
       LEFT JOIN branches b ON b.id = c.branch_id
      WHERE c.id = $1 AND c.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!c) throw ApiError.notFound('Case not found.');
  // Audit the ACCESS itself — sensitive information was just read.
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'pastoral.case.view', entity: 'pastoral_case', entityId: id, branchId: c.branch_id, ip, metadata: { member_id: c.member_id, member: `${c.first_name} ${c.last_name}` } });
  const notes = await query<any>(
    `SELECT n.*, u.name AS by_user_name FROM pastoral_notes n LEFT JOIN users u ON u.id = n.by_user
      WHERE n.case_id = $1 ORDER BY n.created_at DESC`, [id],
  );
  return { case: c, notes };
}

export async function createCase(scope: AccessScope, input: { member_id: string; type: string; title: string; assigned_to?: string }, ip?: string) {
  requireManage(scope);
  const member = await queryOne<any>('SELECT id, branch_id FROM members WHERE id = $1 AND deleted_at IS NULL', [input.member_id]);
  if (!member) throw ApiError.notFound('Member not found.');
  const c = await queryOne<any>(
    `INSERT INTO pastoral_cases (org_id, branch_id, member_id, type, title, assigned_to, status)
     VALUES ($1,$2,$3,$4,$5,$6,'open') RETURNING *`,
    [scope.orgId, member.branch_id, input.member_id, input.type, input.title, input.assigned_to ?? null],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'pastoral.case.create', entity: 'pastoral_case', entityId: c.id, branchId: member.branch_id, ip, metadata: { member_id: input.member_id, type: input.type, title: input.title } });
  if (input.assigned_to && input.assigned_to !== scope.userId) {
    const { notifyUsers } = await import('../notify/notifyService');
    await notifyUsers([input.assigned_to], { type: 'task_assigned', title: 'New pastoral case assigned', body: input.title, link: `/pastoral/cases/${c.id}` }).catch(() => {});
  }
  return c;
}

export async function updateCase(scope: AccessScope, id: string, input: { status?: string; assigned_to?: string; resolution?: string }, ip?: string) {
  requireManage(scope);
  const existing = await queryOne<any>('SELECT * FROM pastoral_cases WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) throw ApiError.notFound();
  const status = input.status ?? existing.status;
  const closedAt = status === 'closed' || status === 'resolved' ? (existing.closed_at ?? new Date().toISOString()) : null;
  const c = await queryOne<any>(
    `UPDATE pastoral_cases SET status=$2, assigned_to=$3, resolution=$4, closed_at=$5 WHERE id=$1 RETURNING *`,
    [id, status, input.assigned_to !== undefined ? (input.assigned_to || null) : existing.assigned_to,
     input.resolution !== undefined ? input.resolution : existing.resolution, closedAt],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'pastoral.case.update', entity: 'pastoral_case', entityId: id, ip, metadata: { status } });
  return getCase(scope, id, ip);
}

export async function addCaseNote(scope: AccessScope, id: string, body: string, sensitive: boolean, ip?: string) {
  requireManage(scope);
  const existing = await queryOne<any>('SELECT id FROM pastoral_cases WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) throw ApiError.notFound();
  const n = await queryOne<any>(
    'INSERT INTO pastoral_notes (case_id, by_user, body, sensitive) VALUES ($1,$2,$3,$4) RETURNING *',
    [id, scope.userId, body, sensitive],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'pastoral.case.note', entity: 'pastoral_case', entityId: id, ip });
  return n;
}

export async function archiveCase(scope: AccessScope, id: string, ip?: string) {
  requireManage(scope);
  await query('UPDATE pastoral_cases SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'pastoral.case.delete', entity: 'pastoral_case', entityId: id, ip, metadata: { soft: true } });
  return { id };
}

export async function pastoralStats(scope: AccessScope) {
  requireView(scope);
  const [open, inProgress] = await Promise.all([
    queryOne<any>("SELECT COUNT(*)::int AS c FROM pastoral_cases WHERE deleted_at IS NULL AND status IN ('open','in_progress')"),
    queryOne<any>("SELECT COUNT(*)::int AS c FROM pastoral_cases WHERE deleted_at IS NULL AND status = 'open'"),
  ]);
  return { open: inProgress.c, active: open.c };
}
