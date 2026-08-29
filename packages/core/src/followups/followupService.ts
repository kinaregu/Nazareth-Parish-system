/**
 * @nazareth/core — general follow-up system.
 * Follow-ups originate from visitors, new members, attendance, prayer,
 * pastoral care, events, registrations — all unified in one workflow:
 * pending → in_progress → completed / cancelled, with contact history.
 */
import { query, queryOne } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { notifyUsers } from '../notify/notifyService';

function canSee(scope: AccessScope): boolean {
  return hasPermission(scope, 'followups.view') || hasPermission(scope, 'followups.create') || scope.isSuper;
}

export async function listFollowups(scope: AccessScope, opts: {
  status?: string; assigned_to?: string; priority?: string; source?: string; mine?: boolean;
  page: number; pageSize: number;
}) {
  if (!canSee(scope)) throw ApiError.forbidden();
  const [sw, sp] = branchScopeWhere(scope, 'f.branch_id');
  const where = ['1=1'];
  const params: unknown[] = [...sp];
  if (opts.status) { params.push(opts.status); where.push(`f.status = $${params.length}`); }
  if (opts.assigned_to) { params.push(opts.assigned_to); where.push(`f.assigned_to = $${params.length}`); }
  if (opts.priority) { params.push(opts.priority); where.push(`f.priority = $${params.length}`); }
  if (opts.source) { params.push(opts.source); where.push(`f.source = $${params.length}`); }
  if (opts.mine) { params.push(scope.userId); where.push(`f.assigned_to = $${params.length}`); }
  // Leaders see their branch's followups; super sees all.
  const fullWhere = `WHERE ${where.join(' AND ')}${sw}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM followups f ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT f.*, u.name AS assigned_to_name, u2.name AS created_by_name,
            m.first_name || ' ' || m.last_name AS member_name,
            v.first_name || ' ' || COALESCE(v.last_name, '') AS visitor_name
       FROM followups f
       LEFT JOIN users u ON u.id = f.assigned_to
       LEFT JOIN users u2 ON u2.id = f.created_by
       LEFT JOIN members m ON m.id = f.member_id
       LEFT JOIN visitors v ON v.id = f.visitor_id
      ${fullWhere}
      ORDER BY CASE f.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
               f.due_date ASC NULLS LAST, f.created_at DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function getFollowup(scope: AccessScope, id: string) {
  if (!canSee(scope)) throw ApiError.forbidden();
  const [sw0, sp] = branchScopeWhere(scope, 'f.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const f = await queryOne<any>(
    `SELECT f.*, u.name AS assigned_to_name, u2.name AS created_by_name,
            m.first_name, m.last_name, m.member_no, m.email AS member_email, m.phone AS member_phone,
            v.first_name AS v_first, v.last_name AS v_last, v.email AS visitor_email
       FROM followups f
       LEFT JOIN users u ON u.id = f.assigned_to
       LEFT JOIN users u2 ON u2.id = f.created_by
       LEFT JOIN members m ON m.id = f.member_id
       LEFT JOIN visitors v ON v.id = f.visitor_id
      WHERE f.id = $1${sw}`,
    [id, ...sp],
  );
  if (!f) throw ApiError.notFound('Follow-up not found.');
  const notes = await query<any>(
    `SELECT n.*, u.name AS by_user_name FROM followup_notes n LEFT JOIN users u ON u.id = n.by_user
      WHERE n.followup_id = $1 ORDER BY n.created_at DESC`, [id],
  );
  return { followup: f, notes };
}

export async function createFollowup(scope: AccessScope, input: {
  subject_type: string; subject_id: string; member_id?: string; visitor_id?: string;
  reason: string; assigned_to: string; due_date: string; priority?: string; note?: string;
  source?: string;
}, ip?: string) {
  if (!hasPermission(scope, 'followups.create') && !scope.isSuper) throw ApiError.forbidden();
  const f = await queryOne<any>(
    `INSERT INTO followups (org_id, branch_id, source, subject_type, subject_id, member_id, visitor_id, reason, assigned_to, due_date, priority, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12) RETURNING *`,
    [scope.orgId, scope.branchId, input.source ?? input.subject_type, input.subject_type, input.subject_id,
     input.member_id ?? null, input.visitor_id ?? null, input.reason, input.assigned_to, input.due_date,
     input.priority ?? 'normal', scope.userId],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'followup.create', entity: 'followup', entityId: f.id, ip, metadata: { reason: input.reason } });
  if (input.assigned_to !== scope.userId) {
    await notifyUsers([input.assigned_to], { type: 'task_assigned', title: 'New follow-up assigned', body: input.reason, link: '/pastoral/followups' }).catch(() => {});
  }
  return f;
}

export async function updateFollowup(scope: AccessScope, id: string, input: {
  status?: string; outcome?: string; note?: string; assigned_to?: string; due_date?: string; priority?: string;
}, ip?: string) {
  if (!hasPermission(scope, 'followups.manage') && !scope.isSuper) throw ApiError.forbidden();
  const existing = await queryOne<any>('SELECT * FROM followups WHERE id = $1', [id]);
  if (!existing) throw ApiError.notFound();
  const status = input.status ?? existing.status;
  const completedAt = status === 'completed' ? (existing.completed_at ?? new Date().toISOString()) : null;
  const f = await queryOne<any>(
    `UPDATE followups SET status=$2, outcome=$3, assigned_to=$4, due_date=$5, priority=$6, completed_at=$7 WHERE id=$1 RETURNING *`,
    [id, status, input.outcome !== undefined ? input.outcome : existing.outcome,
     input.assigned_to !== undefined ? (input.assigned_to || null) : existing.assigned_to,
     input.due_date ?? existing.due_date, input.priority ?? existing.priority, completedAt],
  );
  if (input.note) {
    await query('INSERT INTO followup_notes (followup_id, by_user, note, outcome) VALUES ($1,$2,$3,$4)',
      [id, scope.userId, input.note, input.outcome ?? null]);
  }
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'followup.update', entity: 'followup', entityId: id, ip, metadata: { status } });
  return getFollowup(scope, id);
}

export async function addFollowupNote(scope: AccessScope, id: string, note: string, outcome?: string, ip?: string) {
  if (!hasPermission(scope, 'followups.manage') && !scope.isSuper) throw ApiError.forbidden();
  await queryOne<any>('SELECT id FROM followups WHERE id = $1', [id]) || ApiError.notFound();
  await query('INSERT INTO followup_notes (followup_id, by_user, note, outcome) VALUES ($1,$2,$3,$4)',
    [id, scope.userId, note, outcome ?? null]);
  if (outcome) await query("UPDATE followups SET status = 'in_progress', outcome = COALESCE(outcome, $2) WHERE id = $1", [id, outcome]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'followup.note', entity: 'followup', entityId: id, ip });
  return getFollowup(scope, id);
}

export async function followupStats(scope: AccessScope) {
  if (!canSee(scope)) return { pending: 0, inProgress: 0, overdue: 0 };
  const [sw, sp] = branchScopeWhere(scope, 'f.branch_id');
  const row = await queryOne<any>(
    `SELECT (COUNT(*) FILTER (WHERE status = 'pending'))::int AS pending,
            (COUNT(*) FILTER (WHERE status = 'in_progress'))::int AS in_progress,
            (COUNT(*) FILTER (WHERE status IN ('pending','in_progress') AND due_date < current_date))::int AS overdue
       FROM followups f WHERE ${'1=1'}${sw}`,
    sp,
  );
  return { pending: row.pending, inProgress: row.in_progress, overdue: row.overdue };
}
