/**
 * @nazareth/core — announcements with audience targeting and
 * draft → scheduled → published → expired lifecycle.
 */
import { query, queryOne } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { notifyUsers, resolveAudienceUserIds } from '../notify/notifyService';

export async function listAnnouncements(scope: AccessScope, opts: { status?: string; page: number; pageSize: number; forUser?: boolean }) {
  const [sw, sp] = branchScopeWhere(scope, 'a.branch_id');
  const where = ['a.deleted_at IS NULL'];
  const params: unknown[] = [...sp];
  if (!opts.forUser && !hasPermission(scope, 'announcements.manage') && !scope.isSuper) {
    where.push(`a.status IN ('published','expired')`);
  }
  if (opts.status) { params.push(opts.status); where.push(`a.status = $${params.length}`); }
  const fullWhere = `WHERE ${where.join(' AND ')}${sw}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM announcements a ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT a.*, b.name AS branch_name, u.name AS created_by_name
       FROM announcements a JOIN branches b ON b.id = a.branch_id
       LEFT JOIN users u ON u.id = a.created_by
      ${fullWhere} ORDER BY a.created_at DESC LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

/** Announcements visible to a member (portal) — audience-targeted only. */
export async function memberAnnouncements(scope: AccessScope, memberId: string) {
  const rows = await query<any>(
    `SELECT a.* FROM announcements a
      WHERE a.org_id = $1 AND a.status = 'published' AND a.deleted_at IS NULL
      ORDER BY a.publish_at DESC LIMIT 50`,
    [scope.orgId],
  );
  const visible: any[] = [];
  for (const a of rows) {
    const aud = (a.audience || { type: 'all' }) as any;
    let ok = false;
    switch (aud.type) {
      case 'all': ok = true; break;
      case 'branch': ok = aud.branch_id === scope.branchId; break;
      case 'ministry': ok = scope.ministryIds.includes(aud.ministry_id); break;
      case 'group': ok = scope.groupIds.includes(aud.group_id); break;
      case 'members': ok = (aud.member_ids || []).includes(memberId); break;
      case 'role': ok = scope.roleCodes.includes(aud.role); break;
    }
    if (ok) visible.push(a);
  }
  return visible;
}

export async function getAnnouncement(scope: AccessScope, id: string) {
  const [sw0, sp] = branchScopeWhere(scope, 'a.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const a = await queryOne<any>(
    `SELECT a.*, b.name AS branch_name, u.name AS created_by_name
       FROM announcements a JOIN branches b ON b.id = a.branch_id LEFT JOIN users u ON u.id = a.created_by
      WHERE a.id = $1 AND a.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!a) throw ApiError.notFound('Announcement not found.');
  if (a.status !== 'published' && !hasPermission(scope, 'announcements.manage') && !scope.isSuper) {
    throw ApiError.forbidden('This announcement is not published yet.');
  }
  return a;
}

function canManageAnnouncement(scope: AccessScope, a: any): boolean {
  if (scope.isSuper) return true;
  if (!hasPermission(scope, 'announcements.manage')) return false;
  const aud = (a.audience || { type: 'all' }) as any;
  if (aud.type === 'ministry') return scope.ministryIds.includes(aud.ministry_id) || scope.branchIds === null;
  if (aud.type === 'group') return scope.groupIds.includes(aud.group_id) || scope.branchIds === null;
  if (aud.type === 'branch') return scope.branchIds === null || scope.branchIds.includes(aud.branch_id);
  return scope.branchIds === null || scope.branchIds.includes(a.branch_id);
}

export async function createAnnouncement(scope: AccessScope, input: any, ip?: string) {
  if (!hasPermission(scope, 'announcements.manage') && !scope.isSuper) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(input.branch_id)) throw ApiError.forbidden();
  const a = await queryOne<any>(
    `INSERT INTO announcements (org_id, branch_id, title, content, audience, status, publish_at, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [scope.orgId, input.branch_id, input.title, input.content, JSON.stringify(input.audience || { type: 'all' }),
     input.status || 'draft', input.publish_at || (input.status === 'published' ? new Date().toISOString() : null),
     input.expires_at || null, scope.userId],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'announcement.create', entity: 'announcement', entityId: a.id, branchId: input.branch_id, ip, metadata: { title: input.title, status: a.status } });
  if (a.status === 'published') await publishAnnouncement(scope, a, true);
  return a;
}

export async function updateAnnouncement(scope: AccessScope, id: string, input: any, ip?: string) {
  const existing = await getAnnouncement(scope, id);
  if (!canManageAnnouncement(scope, existing)) throw ApiError.forbidden();
  const a = await queryOne<any>(
    `UPDATE announcements SET title=$2, content=$3, audience=$4, status=$5, publish_at=$6, expires_at=$7 WHERE id=$1 RETURNING *`,
    [id, input.title ?? existing.title, input.content ?? existing.content,
     JSON.stringify(input.audience ?? existing.audience), input.status ?? existing.status,
     input.publish_at !== undefined ? (input.publish_at || null) : existing.publish_at,
     input.expires_at !== undefined ? (input.expires_at || null) : existing.expires_at],
  );
  if (input.status === 'published' && existing.status !== 'published') await publishAnnouncement(scope, a, false);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'announcement.update', entity: 'announcement', entityId: id, ip, metadata: { status: a.status } });
  return a;
}

async function publishAnnouncement(scope: AccessScope, a: any, initial: boolean) {
  const userIds = await resolveAudienceUserIds(a.audience, scope.orgId, a.branch_id);
  await notifyUsers(userIds, {
    type: 'announcement',
    title: `Announcement: ${a.title}`,
    body: a.content.slice(0, 300),
    link: `/announcements/${a.id}`,
    emailCategory: 'announcements',
    emailSubject: `Nazareth Parish: ${a.title}`,
    emailBody: a.content,
  }).catch((e) => console.error('[announce] notification failed', e));
}

export async function archiveAnnouncement(scope: AccessScope, id: string, ip?: string) {
  const existing = await getAnnouncement(scope, id);
  if (!canManageAnnouncement(scope, existing)) throw ApiError.forbidden();
  await query('UPDATE announcements SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'announcement.delete', entity: 'announcement', entityId: id, ip, metadata: { soft: true } });
  return { id };
}

/** Job: promote due scheduled → published; published past expiry → expired. */
export async function runAnnouncementLifecycle(): Promise<{ published: number; expired: number }> {
  const due = await query<any>(
    `SELECT a.*, b.name AS branch_name FROM announcements a JOIN branches b ON b.id = a.branch_id
      WHERE a.status = 'scheduled' AND a.publish_at <= now() AND a.deleted_at IS NULL`,
  );
  let published = 0;
  for (const a of due) {
    await query(`UPDATE announcements SET status = 'published' WHERE id = $1`, [a.id]);
    const orgId = a.org_id;
    const userIds = await resolveAudienceUserIds(a.audience, orgId, a.branch_id);
    await notifyUsers(userIds, {
      type: 'announcement', title: `Announcement: ${a.title}`, body: a.content.slice(0, 300),
      link: `/announcements/${a.id}`, emailCategory: 'announcements',
      emailSubject: `Nazareth Parish: ${a.title}`, emailBody: a.content,
    }).catch(() => {});
    published++;
  }
  const expiredRows = await query<any>(
    `SELECT id FROM announcements WHERE status = 'published' AND expires_at IS NOT NULL AND expires_at <= now() AND deleted_at IS NULL`,
  );
  if (expiredRows.length) {
    const ids = expiredRows.map((r) => r.id);
    const ph = ids.map((_, i) => `$${i + 1}`).join(',');
    await query(`UPDATE announcements SET status = 'expired' WHERE id IN (${ph})`, ids);
  }
  return { published, expired: expiredRows.length };
}
