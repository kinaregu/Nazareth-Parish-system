/**
 * @nazareth/core — user management (admin only).
 * No endpoint ever returns a password hash. Passwords can only be SET
 * (create / reset) — generated temp passwords are shown once.
 */
import { query, queryOne, queryValue } from '@nazareth/db';
import { ApiError } from '../errors';
import { hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { hashPassword, randomPassword } from '../auth/passwords';
import { notifyUsers } from '../notify/notifyService';

export function requireAdmin(scope: AccessScope) {
  if (!hasPermission(scope, 'users.manage') && !scope.isSuper) throw ApiError.forbidden();
}

export async function listUsers(scope: AccessScope, opts: { search?: string; page: number; pageSize: number }) {
  requireAdmin(scope);
  const where = ['u.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(u.name ILIKE $1 OR u.email ILIKE $1)`);
  }
  const fullWhere = `WHERE ${where.join(' AND ')}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM users u ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT u.id, u.name, u.email, u.phone, u.branch_id, b.name AS branch_name, u.is_active,
            u.email_verified_at, u.last_login_at, u.last_login_ip, u.created_at, u.must_change_password,
            u.totp_enabled, (SELECT m.first_name || ' ' || m.last_name FROM members m WHERE m.id = u.member_id) AS linked_member,
            (SELECT array_agg(r.code ORDER BY r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = u.id) AS roles
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
      ${fullWhere} ORDER BY u.name LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function getUserRoles(scope: AccessScope, userId: string) {
  requireAdmin(scope);
  return query<any>(
    `SELECT r.id AS role_id, r.code, r.name, ur.branch_id, b.name AS branch_name
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       LEFT JOIN branches b ON b.id = ur.branch_id
      WHERE ur.user_id = $1 ORDER BY r.name`,
    [userId],
  );
}

export async function getUser(scope: AccessScope, id: string) {
  requireAdmin(scope);
  const u = await queryOne<any>(
    `SELECT u.id, u.name, u.email, u.phone, u.branch_id, u.is_active, u.email_verified_at,
            u.last_login_at, u.last_login_ip, u.created_at, u.must_change_password, u.totp_enabled, u.member_id,
            (SELECT m.first_name || ' ' || m.last_name FROM members m WHERE m.id = u.member_id) AS linked_member,
            (SELECT m.id FROM members m WHERE m.id = u.member_id) AS linked_member_id
       FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`, [id],
  );
  if (!u) throw ApiError.notFound('User not found.');
  const roles = await getUserRoles(scope, id);
  const loginHistory = await query<any>(
    `SELECT ip, success, created_at FROM login_attempts WHERE email = $1 ORDER BY created_at DESC LIMIT 20`,
    [u.email],
  );
  return { user: u, roles, loginHistory };
}

export async function createUser(scope: AccessScope, input: {
  name: string; email: string; phone?: string; branch_id?: string; role_codes: string[]; member_id?: string;
}, ip?: string) {
  requireAdmin(scope);
  const { hashPassword } = await import('../auth/passwords');
  const { sendMail } = await import('../notify/providers');
  const existing = await queryOne('SELECT id FROM users WHERE lower(email) = lower($1)', [input.email]);
  if (existing) throw ApiError.conflict('A user with this email already exists.');
  const roles = await query<any>('SELECT id, code FROM roles WHERE org_id = $1 AND code = ANY($2::text[]) AND deleted_at IS NULL', [scope.orgId, input.role_codes]);
  if (roles.length === 0) throw ApiError.validation('No valid roles selected.');
  const tempPassword = randomPassword(14);
  const id = (await queryValue<string>(
    `INSERT INTO users (org_id, branch_id, name, email, phone, password_hash, must_change_password)
     VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
    [scope.orgId, input.branch_id ?? null, input.name, input.email, input.phone ?? null, await hashPassword(tempPassword)],
  ))!;
  for (const r of roles) {
    await query('INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, r.id, input.branch_id ?? null]);
  }
  if (input.member_id) await query('UPDATE users SET member_id = $2 WHERE id = $1', [id, input.member_id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'user.create', entity: 'user', entityId: id, ip, metadata: { email: input.email, roles: input.role_codes } });
  await sendMail({ to: input.email, subject: 'Your Nazareth Parish account', body: `Hello ${input.name},\n\nYour account has been created. Your temporary password is:\n\n${tempPassword}\n\nPlease sign in and change your password immediately.\n\n— Nazareth Parish Administration` }).catch(() => {});
  return { id: id[0], tempPassword };
}

export async function updateUser(scope: AccessScope, id: string, input: {
  name?: string; phone?: string; branch_id?: string; role_codes?: string[]; member_id?: string;
  active?: boolean; must_change_password?: boolean;
}, ip?: string) {
  requireAdmin(scope);
  const existing = await queryOne<any>('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) throw ApiError.notFound('User not found.');
  // A super admin cannot demote/disable themselves (self-lockout protection).
  if (id === scope.userId && (input.active === false || (input.role_codes && !input.role_codes.includes('super_admin')))) {
    throw ApiError.conflict('You cannot remove your own super-admin role or deactivate your own account.');
  }
  await queryOne<any>(
    `UPDATE users SET name = COALESCE($2, name), phone = COALESCE($3, phone),
      branch_id = $4, is_active = COALESCE($5, is_active), must_change_password = COALESCE($6, must_change_password)
     WHERE id = $1 RETURNING id`,
    [id, input.name ?? null, input.phone ?? null, input.branch_id !== undefined ? (input.branch_id || null) : existing.branch_id,
     input.active ?? null, input.must_change_password ?? null],
  );
  if (input.member_id !== undefined) await query('UPDATE users SET member_id = $2 WHERE id = $1', [id, input.member_id || null]);
  if (input.role_codes) {
    await query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    const roles = await query<any>('SELECT id FROM roles WHERE org_id = $1 AND code = ANY($2::text[]) AND deleted_at IS NULL', [scope.orgId, input.role_codes]);
    for (const r of roles) {
      await query('INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, r.id, input.branch_id || null]);
    }
  }
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'user.update', entity: 'user', entityId: id, ip, metadata: { email: existing.email, fields: Object.keys(input) } });
  if (input.role_codes) {
    await audit({ userId: scope.userId, orgId: scope.orgId, action: 'user.roles_changed', entity: 'user', entityId: id, ip, metadata: { roles: input.role_codes, previous_roles: (await getUserRoles(scope, id)).map((r: any) => r.code) } });
  }
  return getUser(scope, id);
}

/** Admin-initiated password reset. New password shown once, user forced to change it at next login. */
export async function resetUserPassword(scope: AccessScope, id: string, ip?: string) {
  requireAdmin(scope);
  const existing = await queryOne<any>('SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) throw ApiError.notFound('User not found.');
  const tempPassword = randomPassword(14);
  await query('UPDATE users SET password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = NULL WHERE id = $1', [id, await hashPassword(tempPassword)]);
  await query('DELETE FROM sessions WHERE user_id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'user.password_reset', entity: 'user', entityId: id, ip, metadata: { email: existing.email } });
  return { tempPassword };
}

export async function deactivateUser(scope: AccessScope, id: string, active: boolean, ip?: string) {
  requireAdmin(scope);
  if (id === scope.userId && !active) throw ApiError.conflict('You cannot deactivate your own account.');
  await queryOne<any>('UPDATE users SET is_active = $2 WHERE id = $1 RETURNING id', [id, active]);
  if (!active) await query('DELETE FROM sessions WHERE user_id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: active ? 'user.activate' : 'user.deactivate', entity: 'user', entityId: id, ip });
  return { id, active };
}

/** Users available for assignment (leaders, assignees) — scoped. */
export async function assignableUsers(scope: AccessScope, opts?: { roleCodes?: string[] }) {
  const where = ['u.is_active', 'u.deleted_at IS NULL'];
  const params: unknown[] = [scope.orgId];
  if (opts?.roleCodes?.length) {
    params.push(opts.roleCodes);
    where.push(`EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id WHERE ur2.user_id = u.id AND r2.code = ANY($${params.length}::text[]))`);
  }
  const rows = await query<any>(
    `SELECT u.id, u.name, u.email, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
      WHERE u.org_id = $1 AND ${where.join(' AND ')}
      ORDER BY u.name LIMIT 300`,
    params,
  );
  return rows;
}
