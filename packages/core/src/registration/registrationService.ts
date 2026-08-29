/**
 * @nazareth/core — public member registration workflow.
 *
 * 1. Person registers (public endpoint) → status pending
 * 2. Administrator reviews (registrations.review)
 * 3. Approve → member + user account created, temp password emailed,
 *    welcome follow-up created
 *    Reject → review note recorded
 */
import { query, queryOne, queryCol, queryValue } from '@nazareth/db';
import { ApiError } from '../errors';
import { hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { nextMemberNo } from '../members/memberService';
import { hashPassword, randomPassword } from '../auth/passwords';
import { sendMail } from '../notify/providers';
import { renderTemplate } from '../notify/notifyService';

export async function createRegistration(input: {
  first_name: string; last_name: string; middle_name?: string; gender?: string; date_of_birth?: string;
  email?: string; phone?: string; address?: string; city?: string; country?: string;
  family_name?: string; family_info?: Record<string, unknown>; interests?: string[];
  previous_church?: string; heard_from?: string; message?: string;
}, orgId: string): Promise<{ id: string }> {
  const id = await queryValue<string>(
    `INSERT INTO member_registrations (org_id, first_name, middle_name, last_name, gender, date_of_birth,
       email, phone, address, city, country, family_name, family_info, interests, previous_church, heard_from, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [orgId, input.first_name, input.middle_name ?? null, input.last_name, input.gender ?? null,
     input.date_of_birth || null, input.email ?? null, input.phone ?? null, input.address ?? null,
     input.city ?? null, input.country ?? null, input.family_name ?? null,
     JSON.stringify(input.family_info ?? {}), JSON.stringify(input.interests ?? []),
     input.previous_church ?? null, input.heard_from ?? null, input.message ?? null],
  );
  // Notify admins that a registration awaits review.
  const admins = await queryCol<string>(
    `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE r.code IN ('admin','super_admin')`,
  );
  if (admins.length) {
    const { notifyUsers } = await import('../notify/notifyService');
    await notifyUsers(admins, { type: 'system', title: 'New member registration', body: `${input.first_name} ${input.last_name} submitted a registration.`, link: '/members/registrations' }).catch(() => {});
  }
  return { id: id! };
}

export async function listRegistrations(scope: AccessScope, opts: { status?: string; page: number; pageSize: number }) {
  if (!hasPermission(scope, 'registrations.review') && !scope.isSuper) throw ApiError.forbidden();
  const where = ['r.org_id = $1', 'r.deleted_at IS NULL'];
  const params: unknown[] = [scope.orgId];
  if (opts.status) { params.push(opts.status); where.push(`r.status = $${params.length}`); }
  const fullWhere = `WHERE ${where.join(' AND ')}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM member_registrations r ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT r.*, m.first_name || ' ' || m.last_name AS member_name
       FROM member_registrations r
       LEFT JOIN members m ON m.id = r.member_id
      ${fullWhere} ORDER BY r.created_at DESC LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function reviewRegistration(scope: AccessScope, id: string, decision: 'approve' | 'reject', note?: string, ip?: string) {
  if (!hasPermission(scope, 'registrations.review') && !scope.isSuper) throw ApiError.forbidden();
  const r = await queryOne<any>('SELECT * FROM member_registrations WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL', [id, scope.orgId]);
  if (!r) throw ApiError.notFound('Registration not found.');
  if (r.status !== 'pending') throw ApiError.conflict('This registration has already been reviewed.');

  if (decision === 'reject') {
    await queryOne<any>(
      'UPDATE member_registrations SET status = \'rejected\', reviewed_by = $2, reviewed_at = now(), review_note = $3 WHERE id = $1 RETURNING *',
      [id, scope.userId, note ?? null],
    );
    await audit({ userId: scope.userId, orgId: scope.orgId, action: 'registration.reject', entity: 'member_registration', entityId: id, ip, metadata: { name: `${r.first_name} ${r.last_name}` } });
    if (r.email) {
      await sendMail({ to: r.email, subject: 'Your registration — Nazareth Parish', body: `Hello ${r.first_name},\n\nUnfortunately your registration could not be approved at this time.${note ? `\n\nNote: ${note}` : ''}\n\nIf you believe this is a mistake, please contact the church office.\n\n— Nazareth Parish Administration` }).catch(() => {});
    }
    return { id, status: 'rejected' };
  }

  // ── approve: create member + user account ──
  const primaryBranch = (await queryOne<any>('SELECT id FROM branches WHERE org_id = $1 AND is_primary', [scope.orgId]))!;
  const memberNo = await nextMemberNo(scope.orgId);
  const tempPassword = randomPassword(14);
  const member = await queryOne<any>(
    `INSERT INTO members (org_id, branch_id, member_no, first_name, middle_name, last_name, gender, date_of_birth,
       phone, email, address, city, country, status, date_joined, interests, previous_church, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'new_member',current_date,$14,$15,$16,$17) RETURNING *`,
    [scope.orgId, primaryBranch.id, memberNo, r.first_name, r.middle_name, r.last_name, r.gender, r.date_of_birth,
     r.phone, r.email, r.address, r.city, r.country,
     // interests is jsonb — pg would serialize a bare JS array as a Postgres
     // array literal, so hand it a JSON string (same as createMember/updateMember).
     JSON.stringify(Array.isArray(r.interests) ? r.interests : []),
     r.previous_church,
     r.message ? `Registration note: ${r.message}` : null, scope.userId],
  );
  const userRow = await queryOne<any>('SELECT id FROM users WHERE member_id = $1', [member.id]);
  let userId: string | null = userRow?.id ?? null;
  if (!userId && r.email) {
    const hash = await hashPassword(tempPassword);
    userId = (await queryValue<string>(
      `INSERT INTO users (org_id, branch_id, name, email, phone, password_hash, must_change_password, member_id)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING id`,
      [scope.orgId, primaryBranch.id, `${r.first_name} ${r.last_name}`, r.email, r.phone, hash, member.id],
    ))!;
    const memberRole = await queryOne<any>("SELECT id FROM roles WHERE org_id = $1 AND code = 'member'", [scope.orgId]);
    if (memberRole) await query('INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [userId, memberRole.id, primaryBranch.id]);
  }
  await query(
    `UPDATE member_registrations SET status = 'approved', member_id = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 WHERE id = $1`,
    [id, member.id, scope.userId, note ?? null],
  );
  await query('INSERT INTO member_status_changes (member_id, to_status, changed_by) VALUES ($1,\'new_member\',$2)', [member.id, scope.userId]);
  await query(
    `INSERT INTO followups (org_id, branch_id, source, subject_type, subject_id, member_id, reason, assigned_to, due_date, priority, status, created_by)
     VALUES ($1,$2,'registration','member',$3,$3,'Welcome new member — introduce to a group/mentor',NULL, current_date + 7, 'normal','pending',NULL)`,
    [scope.orgId, primaryBranch.id, member.id],
  );

  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'registration.approve', entity: 'member_registration', entityId: id, ip, metadata: { member_id: member.id, member_no: memberNo } });

  if (r.email && userId) {
    const tmpl = await renderTemplate(scope.orgId, 'new_member_account', { name: r.first_name, email: r.email, password: tempPassword });
    await sendMail({
      to: r.email,
      subject: tmpl?.subject ?? 'Welcome to Nazareth Parish — your account',
      body: tmpl?.body ?? `Hello ${r.first_name},\n\nWelcome! Your member account is ready.\n\nEmail: ${r.email}\nTemporary password: ${tempPassword}\n\nPlease sign in and change your password at first login.`,
    }).catch(() => {});
  }
  return { id, status: 'approved', member_id: member.id, tempPassword: r.email ? tempPassword : undefined };
}
