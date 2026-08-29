/**
 * @nazareth/core — prayer requests with visibility scoping.
 *
 * Visibility: private (submitter only) | pastoral | ministry | group | church.
 * A request is only returned to viewers who satisfy its visibility — private
 * requests are never exposed publicly.
 */
import { query, queryOne, queryCol } from '@nazareth/db';
import { ApiError } from '../errors';
import { hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';

/**
 * Visibility rules (computed server-side, per §27):
 *  - submitter always sees their own
 *  - church: everyone with prayer.view (or portal member)
 *  - pastoral: pastor/super_admin role holders
 *  - ministry: leaders of that ministry (or prayer.manage holders)
 *  - group: leaders of that group (or prayer.manage holders)
 *  - private: submitter only
 */
export async function listPrayerRequests(scope: AccessScope, opts: { status?: string; page: number; pageSize: number }) {
  const canPastoral = scope.isSuper || scope.roleCodes.includes('pastor');
  const canManage = hasPermission(scope, 'prayer.manage');
  const where: string[] = ['p.deleted_at IS NULL', 'p.org_id = $1', 'p.user_id = $2'];
  const params: unknown[] = [scope.orgId, scope.userId];
  if (canPastoral || canManage) where.push('p.visibility = \'church\'');
  if (canPastoral) where.push("p.visibility = 'pastoral'");
  if (scope.ministryIds.length > 0 || canManage) {
    if (scope.ministryIds.length > 0) {
      params.push(scope.ministryIds);
      where.push(`(p.visibility = 'ministry' AND (p.ministry_id = ANY($${params.length}::uuid[]) OR ${canManage}))`);
    } else if (canManage) {
      where.push("p.visibility = 'ministry'");
    }
  }
  if (scope.groupIds.length > 0 || canManage) {
    if (scope.groupIds.length > 0) {
      params.push(scope.groupIds);
      where.push(`(p.visibility = 'group' AND (p.group_id = ANY($${params.length}::uuid[]) OR ${canManage}))`);
    } else if (canManage) {
      where.push("p.visibility = 'group'");
    }
  }
  const visibilityClause = `(${where.slice(2).join(' OR ')})`;
  if (opts.status) { params.push(opts.status); }
  const statusClause = opts.status ? `p.status = $${params.length}` : 'true';
  const fullWhere = `WHERE ${where.slice(0, 2).join(' AND ')} AND ${statusClause} AND (${visibilityClause})`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM prayer_requests p ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT p.*, m.first_name || ' ' || m.last_name AS member_name, u.name AS submitted_by_name,
            u2.name AS assigned_to_name, mn.name AS ministry_name, g.name AS group_name
       FROM prayer_requests p
       LEFT JOIN members m ON m.id = p.member_id
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN users u2 ON u2.id = p.assigned_to
       LEFT JOIN ministries mn ON mn.id = p.ministry_id
       LEFT JOIN groups g ON g.id = p.group_id
      ${fullWhere}
      ORDER BY p.created_at DESC LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

/** Single prayer request, honoring the same visibility rules as the list. */
export async function getPrayerRequest(scope: AccessScope, id: string) {
  const canPastoral = scope.isSuper || scope.roleCodes.includes('pastor');
  const canManage = hasPermission(scope, 'prayer.manage');
  const visibility: string[] = ["p.user_id = $3"]; // own
  if (canPastoral || canManage) visibility.push("p.visibility = 'church'");
  if (canPastoral) visibility.push("p.visibility = 'pastoral'");
  if (scope.ministryIds.length > 0 || canManage) {
    visibility.push(`(p.visibility = 'ministry' AND (p.ministry_id = ANY($4::uuid[]) OR ${canManage}))`);
  }
  if (scope.groupIds.length > 0 || canManage) {
    visibility.push(`(p.visibility = 'group' AND (p.group_id = ANY($5::uuid[]) OR ${canManage}))`);
  }
  const row = await queryOne<any>(
    `SELECT p.*, m.first_name || ' ' || m.last_name AS member_name, u.name AS submitted_by_name,
            u2.name AS assigned_to_name, mn.name AS ministry_name, g.name AS group_name
       FROM prayer_requests p
       LEFT JOIN members m ON m.id = p.member_id
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN users u2 ON u2.id = p.assigned_to
       LEFT JOIN ministries mn ON mn.id = p.ministry_id
       LEFT JOIN groups g ON g.id = p.group_id
      WHERE p.id = $1 AND p.org_id = $2 AND p.deleted_at IS NULL AND (${visibility.join(' OR ')})`,
    [id, scope.orgId, scope.userId, scope.ministryIds, scope.groupIds],
  );
  if (!row) throw ApiError.notFound('Prayer request not found.');
  return row;
}

/** The member's own requests (portal). */
export async function ownPrayerRequests(scope: AccessScope) {
  return query<any>(
    `SELECT p.*, mn.name AS ministry_name, g.name AS group_name
       FROM prayer_requests p
       LEFT JOIN ministries mn ON mn.id = p.ministry_id
       LEFT JOIN groups g ON g.id = p.group_id
      WHERE p.user_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC LIMIT 100`,
    [scope.userId],
  );
}

export async function createPrayerRequest(scope: AccessScope, input: { text: string; category?: string; visibility?: string; ministry_id?: string; group_id?: string }, ip?: string) {
  const memberId = scope.linkedMemberId;
  const visibility = input.visibility ?? 'private';
  // Validate scope of targeted visibility
  if (visibility === 'ministry' && input.ministry_id && !scope.ministryIds.includes(input.ministry_id) && !hasPermission(scope, 'prayer.manage')) {
    throw ApiError.forbidden('You can only post to ministries you belong to.');
  }
  if (visibility === 'group' && input.group_id && !scope.groupIds.includes(input.group_id) && !hasPermission(scope, 'prayer.manage')) {
    throw ApiError.forbidden('You can only post to groups you belong to.');
  }
  const p = await queryOne<any>(
    `INSERT INTO prayer_requests (org_id, branch_id, member_id, user_id, text, category, visibility, ministry_id, group_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [scope.orgId, scope.branchId, memberId, scope.userId, input.text, input.category ?? 'other',
     visibility, input.ministry_id ?? null, input.group_id ?? null],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'prayer.create', entity: 'prayer_request', entityId: p.id, ip, metadata: { visibility } });
  // Notify pastoral team when visibility allows it.
  if (visibility === 'pastoral' || visibility === 'church') {
    const pastoralIds = await queryCol<string>(
      `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE r.code = 'pastor'`,
    );
    if (pastoralIds.length) {
      const { notifyUsers } = await import('../notify/notifyService');
      await notifyUsers(pastoralIds, { type: 'prayer_update', title: 'New prayer request', body: input.text.slice(0, 200), link: '/pastoral/prayer-requests' }).catch(() => {});
    }
  }
  return p;
}

export async function managePrayerRequest(scope: AccessScope, id: string, input: { status?: string; assigned_to?: string }, ip?: string) {
  if (!hasPermission(scope, 'prayer.manage') && !scope.isSuper) throw ApiError.forbidden();
  const existing = await queryOne<any>('SELECT * FROM prayer_requests WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) throw ApiError.notFound();
  const p = await queryOne<any>(
    `UPDATE prayer_requests SET status = $2, assigned_to = $3, closed_at = CASE WHEN $4::text = 'closed' THEN now() ELSE closed_at END WHERE id = $1 RETURNING *`,
    [id, input.status ?? existing.status, input.assigned_to !== undefined ? (input.assigned_to || null) : existing.assigned_to, input.status ?? existing.status],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'prayer.manage', entity: 'prayer_request', entityId: id, ip, metadata: { status: p.status } });
  return p;
}

export async function closeOwnRequest(scope: AccessScope, id: string) {
  const p = await queryOne<any>("UPDATE prayer_requests SET status = 'closed', closed_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING *", [id, scope.userId]);
  if (!p) throw ApiError.notFound('Prayer request not found.');
  return p;
}

export async function prayerStats(scope: AccessScope) {
  const active = await queryOne<any>("SELECT COUNT(*)::int AS c FROM prayer_requests WHERE deleted_at IS NULL AND status = 'active'");
  return { active: active.c };
}
