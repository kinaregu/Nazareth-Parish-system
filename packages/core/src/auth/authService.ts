/**
 * @nazareth/core — authentication service.
 *
 * - scrypt password hashing (never plaintext)
 * - DB-backed sessions in httpOnly cookies, sliding expiry, remember-me
 * - login rate limiting + account lockout (5 failed → 15 min)
 * - email verification & password reset tokens (hashed, expiring, single-use)
 * - TOTP two-factor (opt-in per user)
 */
import { query, queryOne, queryValue } from '@nazareth/db';
import { ApiError } from '../errors';
import { config } from '../config';
import { hashPassword, verifyPassword, randomPassword } from './passwords';
import { randomToken, hashToken } from './tokens';
import { generateTotpSecret, verifyTotpCode, otpauthUri } from './totp';
import { loginRateLimit } from './ratelimit';
import { audit } from '../audit/auditService';
import { sendMail, sendSms } from '../notify/providers';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export interface AuthUser {
  id: string;
  org_id: string;
  branch_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  avatar_file_id: string | null;
  must_change_password: boolean;
  email_verified_at: string | null;
  totp_enabled: boolean;
  is_active: boolean;
  member_id: string | null;
  last_login_at: string | null;
  created_at: string;
}

const USER_SELECT = `SELECT id, org_id, branch_id, name, email, phone, avatar_file_id,
  must_change_password, email_verified_at, (totp_secret IS NOT NULL) AS totp_enabled, is_active, member_id, last_login_at, created_at
  FROM users WHERE id = $1 AND deleted_at IS NULL`;

export async function getUserById(userId: string): Promise<AuthUser | null> {
  return (await queryOne<any>(USER_SELECT, [userId])) as AuthUser | null;
}

export async function createUserUser(params: {
  orgId: string;
  branchId: string | null;
  name: string;
  email: string;
  phone?: string | null;
  password?: string;
  roleCodes: string[];
  memberId?: string | null;
  mustChangePassword?: boolean;
}): Promise<{ user: AuthUser; tempPassword?: string }> {
  const existing = await queryOne('SELECT id FROM users WHERE org_id = $1 AND lower(email) = lower($2)', [params.orgId, params.email]);
  if (existing) throw ApiError.conflict('A user with this email already exists.');
  const tempPassword = params.password ?? randomPassword(12);
  const passwordHash = await hashPassword(tempPassword);
  const userId = (await queryValue<string>(
    `INSERT INTO users (org_id, branch_id, name, email, phone, password_hash, must_change_password, member_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [params.orgId, params.branchId, params.name, params.email, params.phone ?? null, passwordHash, params.mustChangePassword ?? false, params.memberId ?? null],
  ))!;
  for (const code of params.roleCodes) {
    const role = await queryOne('SELECT id FROM roles WHERE org_id = $1 AND code = $2 AND deleted_at IS NULL', [params.orgId, code]);
    if (role) {
      await query('INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [userId, role.id, params.branchId]);
    }
  }
  const user = (await getUserById(userId))!;
  return { user, tempPassword };
}

export async function login(opts: {
  email: string;
  password: string;
  remember?: boolean;
  ip?: string;
  userAgent?: string;
  totpCode?: string;
}): Promise<{ user: AuthUser; token: string; totpRequired?: boolean }> {
  const { email, password, remember = false, ip, userAgent, totpCode } = opts;
  const rl = loginRateLimit(ip || 'unknown', email);
  if (!rl.ok) throw ApiError.rateLimited();

  const rows = await query<any>(
    `SELECT id, email_verified_at, totp_secret, is_active, locked_until, failed_logins, org_id FROM users
      WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email],
  );
  const user = rows[0];
  if (!user) {
    // Uniform response (no user enumeration).
    await logAttempt(ip ?? null, email, false);
    throw ApiError.unauthorized('Invalid email or password.');
  }
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    throw ApiError.rateLimited('Account temporarily locked due to repeated failed sign-ins. Try again later.');
  }

  const ok = await verifyPassword(password, (await queryOne<any>('SELECT password_hash FROM users WHERE id = $1', [user.id]))!.password_hash);
  if (!ok || !user.is_active) {
    await incrementFailed(user.id);
    await logAttempt(ip ?? null, email, false);
    await audit({ userId: user.id, action: 'auth.login_failed', entity: 'user', entityId: user.id, ip, userAgent, metadata: { email } });
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (user.totp_secret && !totpCode) {
    return { user: (await getUserById(user.id))!, token: '', totpRequired: true };
  }
  if (user.totp_secret && !verifyTotpCode(user.totp_secret, totpCode!)) {
    await logAttempt(ip ?? null, email, false);
    throw ApiError.unauthorized('Invalid two-factor code.');
  }

  await query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now(), last_login_ip = $2 WHERE id = $1', [user.id, ip ?? null]);
  await logAttempt(ip ?? null, email, true);

  const token = randomToken(32);
  const expiresSecs = remember
    ? config.sessionRememberDays * 86_400
    : Math.max(60, Math.round(config.sessionIdleMinutes * 60));
  await query(
    `INSERT INTO sessions (user_id, token_hash, ip, user_agent, remember, expires_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6), now())`,
    [user.id, hashToken(token), ip ?? null, userAgent ?? null, remember, expiresSecs],
  );
  await audit({ userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ip, userAgent });
  return { user: (await getUserById(user.id))!, token };
}

export async function getSession(token: string): Promise<{ userId: string; expiresAt: Date } | null> {
  const row = await queryOne<any>('SELECT user_id, expires_at, remember FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    return null;
  }
  // Sliding expiry for remember-me sessions.
  if (row.remember) {
    await query('UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(secs => $2) WHERE token_hash = $1', [hashToken(token), config.sessionRememberDays * 86_400]);
  } else {
    // Refresh idle expiry on activity.
    await query('UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(secs => $2) WHERE token_hash = $1', [hashToken(token), Math.max(60, Math.round(config.sessionIdleMinutes * 60))]);
  }
  return { userId: row.user_id, expiresAt: new Date(row.expires_at) };
}

export async function logout(token: string, userId?: string, ip?: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  if (userId) await audit({ userId, action: 'auth.logout', entity: 'user', entityId: userId, ip });
}

async function logAttempt(ip: string | null, email: string, success: boolean) {
  await query('INSERT INTO login_attempts (ip, email, success) VALUES ($1,$2,$3)', [ip ?? null, email, success]).catch(() => {});
}

async function incrementFailed(userId: string) {
  const row = await queryOne<any>('SELECT failed_logins FROM users WHERE id = $1', [userId]);
  if (!row) return;
  const failed = row.failed_logins + 1;
  if (failed >= MAX_FAILED) {
    await query('UPDATE users SET failed_logins = $2, locked_until = now() + make_interval(mins => $3) WHERE id = $1', [userId, failed, LOCK_MINUTES]);
  } else {
    await query('UPDATE users SET failed_logins = $2 WHERE id = $1', [userId, failed]);
  }
}

/* ─────────────────────────── Password reset ─────────────────────────── */

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await queryOne<any>('SELECT id, email, name FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL', [email]);
  // Always resolve successfully to avoid account enumeration.
  if (!user) return;
  const token = randomToken(32);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval '1 hour')`,
    [user.id, hashToken(token)],
  );
  const link = `${config.appUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your password — Nazareth Parish ChMS',
    body: `Hello ${user.name},\n\nWe received a request to reset your password. Open the link below within 1 hour:\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const row = await queryOne<any>(
    `SELECT prt.id, u.email, u.name FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = $1 AND prt.used_at IS NULL AND prt.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) throw ApiError.validation('This reset link is invalid or has expired. Request a new one.');
  await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [row.id]);
  await query('UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL, must_change_password = false WHERE id = $1', [
    row.id ? (await queryOne('SELECT user_id FROM password_reset_tokens WHERE id = $1', [row.id]))!.user_id : null,
    await hashPassword(newPassword),
  ]);
  // Revoke all other sessions of that user.
  await query('DELETE FROM sessions WHERE user_id = $1', [(await queryOne('SELECT user_id FROM password_reset_tokens WHERE id = $1', [row.id]))!.user_id]);
  await audit({ userId: row.id, action: 'auth.password_reset', entity: 'user', entityId: row.id, metadata: { email: row.email } });
}

/* ─────────────────────────── Email verification ─────────────────────────── */

export async function sendVerificationEmail(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user || user.email_verified_at) return;
  const token = randomToken(32);
  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval '24 hours')`,
    [userId, hashToken(token)],
  );
  const link = `${config.appUrl}/verify-email?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your email — Nazareth Parish ChMS',
    body: `Hello ${user.name},\n\nPlease confirm your email address:\n\n${link}\n\nThis link expires in 24 hours.`,
  });
}

export async function verifyEmail(token: string): Promise<void> {
  const row = await queryOne<any>(
    'SELECT id, user_id FROM email_verification_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()',
    [hashToken(token)],
  );
  if (!row) throw ApiError.validation('This verification link is invalid or has expired.');
  await query('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [row.id]);
  await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [row.user_id]);
  await audit({ userId: row.user_id, action: 'auth.email_verified', entity: 'user', entityId: row.user_id });
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const user = await queryOne<any>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!user) throw ApiError.notFound();
  if (!(await verifyPassword(current, user.password_hash))) {
    throw ApiError.validation('Current password is incorrect.');
  }
  await query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1', [userId, await hashPassword(next)]);
  await query('DELETE FROM sessions WHERE user_id = $1 AND last_seen_at < now()', [userId]);
  await audit({ userId, action: 'auth.password_changed', entity: 'user', entityId: userId });
}

/* ─────────────────────────── TOTP (2FA) ─────────────────────────── */

export async function totpSetup(userId: string, orgName: string): Promise<{ secret: string; uri: string }> {
  const user = await getUserById(userId);
  if (!user) throw ApiError.notFound();
  const secret = generateTotpSecret();
  // Staged: stored but only activated after code verification (see totpEnable).
  await query('UPDATE users SET totp_secret = $2 || \'#PENDING\' WHERE id = $1', [userId, secret]);
  const uri = otpauthUri(secret, user.email, orgName);
  return { secret, uri };
}

export async function totpEnable(userId: string, code: string): Promise<void> {
  const row = await queryOne<any>('SELECT totp_secret FROM users WHERE id = $1', [userId]);
  if (!row?.totp_secret || !row.totp_secret.endsWith('#PENDING')) {
    throw ApiError.validation('Start by setting up two-factor authentication first.');
  }
  const secret = row.totp_secret.replace('#PENDING', '');
  if (!verifyTotpCode(secret, code)) throw ApiError.validation('The code is incorrect. Try again.');
  await query('UPDATE users SET totp_secret = $2 WHERE id = $1', [userId, secret]);
  await audit({ userId, action: 'auth.totp_enabled', entity: 'user', entityId: userId });
}

export async function totpDisable(userId: string, password: string): Promise<void> {
  const row = await queryOne<any>('SELECT password_hash, totp_secret FROM users WHERE id = $1', [userId]);
  if (!row?.totp_secret) return;
  if (!(await verifyPassword(password, row.password_hash))) throw ApiError.validation('Password is incorrect.');
  await query('UPDATE users SET totp_secret = NULL WHERE id = $1', [userId]);
  await audit({ userId, action: 'auth.totp_disabled', entity: 'user', entityId: userId });
}
