/**
 * @nazareth/core — visitor management + visitor→member conversion.
 *
 * Conversion NEVER deletes the visitor record: the visitor row is preserved
 * with followup_status='converted', converted_member_id set, so the full
 * history (first visit, invites, follow-up notes) remains traceable.
 */
import { query, queryOne, tx } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { nextMemberNo, createMember } from '../members/memberService';
import { notifyUsers } from '../notify/notifyService';

export async function listVisitors(scope: AccessScope, opts: {
  search?: string; status?: string; branch_id?: string; from?: string; to?: string;
  page: number; pageSize: number;
}) {
  const [sw, sp] = branchScopeWhere(scope);
  const where: string[] = ['v.deleted_at IS NULL'];
  const params: unknown[] = [...sp];
  if (opts.search) {
    const q = `%${opts.search}%`;
    params.push(q, q, q);
    where.push(`(v.first_name ILIKE $${params.length - 2} OR v.last_name ILIKE $${params.length - 1} OR v.phone ILIKE $${params.length} OR v.email ILIKE $${params.length})`);
  }
  if (opts.status) { params.push(opts.status); where.push(`v.followup_status = $${params.length}`); }
  if (opts.branch_id) { params.push(opts.branch_id); where.push(`v.branch_id = $${params.length}`); }
  if (opts.from) { params.push(opts.from); where.push(`v.visit_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`v.visit_date <= $${params.length}`); }
  const fullWhere = `WHERE ${where.join(' AND ')}${sw}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM visitors v ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT v.*, b.name AS branch_name, sv.name AS service_name, u.name AS assigned_to_name
       FROM visitors v
       JOIN branches b ON b.id = v.branch_id
       LEFT JOIN services sv ON sv.id = v.service_id
       LEFT JOIN users u ON u.id = v.assigned_to
      ${fullWhere}
      ORDER BY v.visit_date DESC, v.id DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function getVisitor(scope: AccessScope, id: string) {
  const [sw0, sp] = branchScopeWhere(scope, 'v.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const v = await queryOne<any>(
    `SELECT v.*, b.name AS branch_name, sv.name AS service_name, u.name AS assigned_to_name
       FROM visitors v JOIN branches b ON b.id = v.branch_id
       LEFT JOIN services sv ON sv.id = v.service_id
       LEFT JOIN users u ON u.id = v.assigned_to
      WHERE v.id = $1 AND v.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!v) throw ApiError.notFound('Visitor not found.');
  const followups = await query<any>(
    `SELECT vf.*, u.name AS by_user_name FROM visitor_followups vf
      LEFT JOIN users u ON u.id = vf.by_user WHERE vf.visitor_id = $1 ORDER BY vf.created_at DESC`,
    [id],
  );
  const converted = v.converted_member_id
    ? await queryOne<any>('SELECT id, member_no, first_name, last_name, status FROM members WHERE id = $1', [v.converted_member_id])
    : null;
  return { visitor: v, followups, converted };
}

export async function createVisitor(scope: AccessScope, input: any, ip?: string) {
  if (!hasPermission(scope, 'visitors.create')) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(input.branch_id)) throw ApiError.forbidden('You can only register visitors for your branch.');
  const v = await queryOne<any>(
    `INSERT INTO visitors (org_id, branch_id, service_id, visit_date, first_name, middle_name, last_name,
       phone, email, address, city, heard_from, invited_by, interests, followup_status, assigned_to, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [scope.orgId, input.branch_id, input.service_id ?? null, input.visit_date, input.first_name, input.middle_name ?? null,
     input.last_name ?? null, input.phone ?? null, input.email ?? null, input.address ?? null, input.city ?? null,
     input.heard_from ?? null, input.invited_by ?? null, JSON.stringify(input.interests ?? []),
     input.assigned_to ? 'planned' : 'none', input.assigned_to ?? null, input.note ?? null],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'visitor.create', entity: 'visitor', entityId: v.id, branchId: input.branch_id, ip, metadata: { name: `${v.first_name} ${v.last_name ?? ''}`.trim() } });
  // Create the follow-up task if someone was assigned.
  if (input.assigned_to) {
    await query(
      `INSERT INTO followups (org_id, branch_id, source, subject_type, subject_id, visitor_id, reason, assigned_to, due_date, priority, status, created_by)
       VALUES ($1,$2,'visitor','visitor',$3,$4,$5,$6, current_date + 3, 'normal','pending',$7)`,
      [scope.orgId, input.branch_id, v.id, v.id, `New visitor follow-up: ${v.first_name} ${v.last_name ?? ''}`.trim(), input.assigned_to, scope.userId],
    );
    await notifyUsers([input.assigned_to], { type: 'task_assigned', title: 'New visitor follow-up assigned', body: `Follow up with visitor ${v.first_name} ${v.last_name ?? ''}`, link: '/visitors' });
  }
  return v;
}

export async function updateVisitor(scope: AccessScope, id: string, input: any, ip?: string) {
  if (!hasPermission(scope, 'visitors.edit')) throw ApiError.forbidden();
  const v = await getVisitor(scope, id);
  await queryOne<any>(
    `UPDATE visitors SET service_id=$2, visit_date=$3, first_name=$4, middle_name=$5, last_name=$6, phone=$7,
      email=$8, address=$9, city=$10, heard_from=$11, invited_by=$12, interests=$13, followup_status=$14,
      assigned_to=$15, note=$16 WHERE id=$1 RETURNING *`,
    [id, input.service_id ?? v.visitor.service_id, input.visit_date ?? v.visitor.visit_date,
     input.first_name ?? v.visitor.first_name, input.middle_name ?? v.visitor.middle_name, input.last_name ?? v.visitor.last_name,
     input.phone ?? v.visitor.phone, input.email ?? v.visitor.email, input.address ?? v.visitor.address,
     input.city ?? v.visitor.city, input.heard_from ?? v.visitor.heard_from, input.invited_by ?? v.visitor.invited_by,
     JSON.stringify(input.interests ?? v.visitor.interests), input.followup_status ?? v.visitor.followup_status,
     input.assigned_to ?? v.visitor.assigned_to, input.note ?? v.visitor.note],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'visitor.update', entity: 'visitor', entityId: id, branchId: v.visitor.branch_id, ip });
  return (await getVisitor(scope, id)).visitor;
}

export async function addVisitorFollowup(scope: AccessScope, id: string, note: string, outcome?: string, ip?: string) {
  if (!hasPermission(scope, 'visitors.edit')) throw ApiError.forbidden();
  const v = await getVisitor(scope, id);
  await query('INSERT INTO visitor_followups (visitor_id, by_user, outcome, note) VALUES ($1,$2,$3,$4)',
    [id, scope.userId, outcome ?? null, note]);
  const newStatus = outcome ? 'contacted' : v.visitor.followup_status;
  await query('UPDATE visitors SET followup_status = $2, updated_at = now() WHERE id = $1', [id, newStatus === 'none' ? 'planned' : newStatus]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'visitor.followup', entity: 'visitor', entityId: id, ip, metadata: { outcome } });
  return getVisitor(scope, id);
}

/**
 * Convert a visitor into a member.
 * Workflow: Visitor → (follow-up) → new member → active member.
 * The original visitor record is preserved (converted_member_id + status).
 */
export async function convertVisitor(scope: AccessScope, id: string, input: { status: string; branch_id: string }, ip?: string) {
  if (!hasPermission(scope, 'visitors.convert')) throw ApiError.forbidden();
  const { visitor: v } = await getVisitor(scope, id);
  if (v.converted_member_id) throw ApiError.conflict('This visitor has already been converted.');

  const member = await tx(async (t) => {
    const memberNo = await nextMemberNo(scope.orgId);
    const rows = await t.query(
      `INSERT INTO members (org_id, branch_id, member_no, first_name, middle_name, last_name,
         phone, email, address, city, date_joined, first_attendance, status, previous_church, interests, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,current_date,$11,$12,$13,$14,$15) RETURNING *`,
      [scope.orgId, input.branch_id, memberNo, v.first_name, v.middle_name, v.last_name,
       v.phone, v.email, v.address, v.city, v.visit_date, input.status,
       null, JSON.stringify(v.interests ?? []),
       v.note ? `Converted from visitor (first visit ${v.visit_date}). ${v.note}`.trim() : `Converted from visitor (first visit ${v.visit_date}).`],
    );
    const m = rows[0];
    await t.query('INSERT INTO member_status_changes (member_id, to_status, changed_by) VALUES ($1,$2,$3)', [m.id, input.status, scope.userId]);
    await t.query(
      `UPDATE visitors SET converted_member_id = $2, converted_at = now(), followup_status = 'converted' WHERE id = $1`,
      [id, m.id],
    );
    // New member follow-up
    await t.query(
      `INSERT INTO followups (org_id, branch_id, source, subject_type, subject_id, member_id, reason, assigned_to, due_date, priority, status, created_by)
       VALUES ($1,$2,'new_member','member',$3,$3,'Welcome new member — introduce to a group/mentor',$4, current_date + 7, 'normal','pending',$5)`,
      [scope.orgId, input.branch_id, m.id, scope.userId, scope.userId],
    );
    return m;
  });

  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'visitor.convert', entity: 'visitor', entityId: id, branchId: input.branch_id, ip, metadata: { member_id: member.id } });

  // Welcome message via template (best effort) + in-app notification to the new member's user if one exists.
  const { renderTemplate } = await import('../notify/notifyService');
  const tmpl = await renderTemplate(scope.orgId, 'welcome_member', { name: member.first_name, church: 'Nazareth Parish Church' });
  if (tmpl && member.email) {
    const { sendMail } = await import('../notify/providers');
    await sendMail({ to: member.email, subject: tmpl.subject, body: tmpl.body }).catch(() => {});
  }
  return { member, visitor: (await getVisitor(scope, id)).visitor };
}

export async function visitorStats(scope: AccessScope) {
  const [sw, sp] = branchScopeWhere(scope);
  const p = (sql: string) => queryOne<any>(sql, sp);
  const base = `FROM visitors v WHERE v.deleted_at IS NULL${sw}`;
  const [thisMonth, total] = await Promise.all([
    p(`SELECT COUNT(*)::int AS c ${base} AND v.visit_date >= date_trunc('month', current_date)`),
    p(`SELECT COUNT(*)::int AS c ${base}`),
  ]);
  const needsFollowup = await p(`SELECT COUNT(*)::int AS c ${base} AND v.followup_status IN ('none','planned') AND v.converted_member_id IS NULL`);
  return { thisMonth: thisMonth.c, total: total.c, needsFollowup: needsFollowup.c };
}
