/**
 * @nazareth/core — church settings (org-level) + configurable enums
 * (membership statuses, branches, message templates, integrations).
 */
import { query, queryOne } from '@nazareth/db';
import { ApiError } from '../errors';
import { hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';

function requireSettingsAdmin(scope: AccessScope) {
  if (!hasPermission(scope, 'settings.manage') && !scope.isSuper) throw ApiError.forbidden();
}

export async function getSettings(scope: AccessScope) {
  const org = await queryOne<any>('SELECT * FROM organizations WHERE id = $1', [scope.orgId]);
  if (!org) throw ApiError.notFound();
  const branches = await query<any>('SELECT id, code, name, is_primary, is_active, address, phone, email FROM branches WHERE org_id = $1 AND deleted_at IS NULL ORDER BY is_primary DESC, name', [scope.orgId]);
  const statuses = await query<any>('SELECT * FROM member_status_defs WHERE org_id = $1 ORDER BY code', [scope.orgId]);
  return { org, branches, statuses };
}

export async function updateSettings(scope: AccessScope, input: Record<string, unknown>, ip?: string) {
  requireSettingsAdmin(scope);
  const allowed: [string, (v: unknown) => unknown][] = [
    ['name', (v) => String(v)], ['address', (v) => v || null], ['phone', (v) => v || null],
    ['email', (v) => v || null], ['website', (v) => v || null], ['timezone', (v) => v || null],
    ['currency', (v) => String(v).toUpperCase()], ['date_format', (v) => v || null],
    ['country', (v) => v || null], ['default_language', (v) => v || null],
  ];
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [col, cast] of allowed) {
    if (input[col] !== undefined) { params.push(cast(input[col])); fields.push(`${col} = $${params.length}`); }
  }
  if (fields.length) {
    params.push(scope.orgId);
    await queryOne<any>(`UPDATE organizations SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING id`, params);
  }
  const settings = { ...((await queryOne<any>('SELECT settings FROM organizations WHERE id = $1', [scope.orgId]))?.settings ?? {}) };
  if (input.member_self_view_giving !== undefined) settings.member_self_view_giving = Boolean(input.member_self_view_giving);
  if (input.member_editable_fields !== undefined) settings.member_editable_fields = input.member_editable_fields;
  await query('UPDATE organizations SET settings = $2 WHERE id = $1', [scope.orgId, JSON.stringify(settings)]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'settings.update', entity: 'organization', entityId: scope.orgId, ip, metadata: { fields: Object.keys(input) } });
  return getSettings(scope);
}

/* ─────────────────────────── Branches ─────────────────────────── */

export async function createBranch(scope: AccessScope, input: { code: string; name: string; address?: string; phone?: string; email?: string }, ip?: string) {
  requireSettingsAdmin(scope);
  const b = await queryOne<any>(
    `INSERT INTO branches (org_id, code, name, address, phone, email, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6, false) RETURNING *`,
    [scope.orgId, input.code, input.name, input.address ?? null, input.phone ?? null, input.email ?? null],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'branch.create', entity: 'branch', entityId: b.id, ip, metadata: { name: input.name } });
  return b;
}

export async function updateBranch(scope: AccessScope, id: string, input: { name?: string; address?: string; phone?: string; email?: string; is_active?: boolean }, ip?: string) {
  requireSettingsAdmin(scope);
  const b = await queryOne<any>(
    `UPDATE branches SET name = COALESCE($2, name), address = COALESCE($3, address), phone = COALESCE($4, phone),
      email = COALESCE($5, email), is_active = COALESCE($6, is_active) WHERE id = $1 AND org_id = $7 RETURNING *`,
    [id, input.name ?? null, input.address ?? null, input.phone ?? null, input.email ?? null, input.is_active ?? null, scope.orgId],
  );
  if (!b) throw ApiError.notFound();
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'branch.update', entity: 'branch', entityId: id, ip, metadata: { name: b.name } });
  return b;
}

/* ─────────────────────────── Membership statuses ─────────────────────────── */

export async function createStatus(scope: AccessScope, input: { code: string; name: string; color?: string; active?: boolean }, ip?: string) {
  requireSettingsAdmin(scope);
  const s = await queryOne<any>(
    `INSERT INTO member_status_defs (org_id, code, name, color, is_active) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (org_id, code) DO NOTHING RETURNING *`,
    [scope.orgId, input.code, input.name, input.color ?? '#1e3a8a', input.active ?? true],
  );
  if (!s) throw ApiError.conflict('A status with this code already exists.');
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'settings.status_create', entity: 'member_status', entityId: s.id, ip, metadata: { code: input.code } });
  return s;
}

export async function updateStatus(scope: AccessScope, id: string, input: { name?: string; color?: string; active?: boolean }, ip?: string) {
  requireSettingsAdmin(scope);
  const s = await queryOne<any>(
    'UPDATE member_status_defs SET name = COALESCE($2, name), color = COALESCE($3, color), is_active = COALESCE($4, is_active) WHERE id = $1 AND org_id = $5 RETURNING *',
    [id, input.name ?? null, input.color ?? null, input.active ?? null, scope.orgId],
  );
  if (!s) throw ApiError.notFound();
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'settings.status_update', entity: 'member_status', entityId: id, ip });
  return s;
}

/* ─────────────────────────── Integrations (future provider configs) ─────────────────────────── */

export async function listIntegrations(scope: AccessScope) {
  requireSettingsAdmin(scope);
  return query<any>('SELECT id, channel, provider, is_active, config, created_at, updated_at FROM integration_configs WHERE org_id = $1 ORDER BY channel, provider', [scope.orgId]);
}

export async function saveIntegration(scope: AccessScope, input: { id?: string; channel: string; provider: string; is_active: boolean; config: Record<string, unknown> }, ip?: string) {
  requireSettingsAdmin(scope);
  if (input.id) {
    const r = await queryOne<any>(
      'UPDATE integration_configs SET is_active = $2, config = $3 WHERE id = $4 AND org_id = $5 RETURNING *',
      [input.is_active, JSON.stringify(input.config), input.id, scope.orgId],
    );
    if (!r) throw ApiError.notFound();
    await audit({ userId: scope.userId, orgId: scope.orgId, action: 'integration.update', entity: 'integration_config', entityId: r.id, ip, metadata: { channel: input.channel, provider: input.provider } });
    return r;
  }
  const r = await queryOne<any>(
    `INSERT INTO integration_configs (org_id, channel, provider, is_active, config) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (org_id, channel, provider) DO UPDATE SET is_active = EXCLUDED.is_active, config = EXCLUDED.config RETURNING *`,
    [scope.orgId, input.channel, input.provider, input.is_active, JSON.stringify(input.config)],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'integration.create', entity: 'integration_config', entityId: r.id, ip, metadata: { channel: input.channel, provider: input.provider } });
  return r;
}

/* ─────────────────────────── Public org info (login page etc.) ─────────────────────────── */

export async function getPublicOrg(orgId: string) {
  return queryOne<any>('SELECT name, address, phone, email, website, logo_file_id FROM organizations WHERE id = $1', [orgId]);
}
