/**
 * @nazareth/core — access scoping.
 *
 * Every authenticated request resolves into an AccessScope:
 *  - which permissions the user holds (from roles)
 *  - which branches they can see
 *  - which members they can see (branch-wide, ministry/group-scoped, or self-only)
 *
 * All repository queries MUST be built from this scope. There is no
 * "find by id" without a scope — that is what prevents IDOR (§72).
 */
import { query, queryCol } from '@nazareth/db';

export interface AccessScope {
  userId: string;
  orgId: string;
  /** User's home branch; null when unrestricted. */
  branchId: string | null;
  /** Branch ids the user may see; null = all branches. */
  branchIds: string[] | null;
  roleCodes: string[];
  permissions: Set<string>;
  /** Ministries the user leads (leader/assistant). */
  ministryIds: string[];
  /** Groups the user leads (leader/assistant). */
  groupIds: string[];
  isSuper: boolean;
  /** Restricted member ids; null = no member-level restriction. */
  memberIds: string[] | null;
  /** The member record linked to this user, if any. */
  linkedMemberId: string | null;
}

export async function loadScope(userId: string): Promise<AccessScope | null> {
  const user = await query<any>(
    `SELECT id, org_id, branch_id, is_active, member_id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (user.length === 0 || !user[0].is_active) return null;
  const u = user[0];

  const roleRows = await query<any>(
    `SELECT r.code, ur.branch_id
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1 AND r.deleted_at IS NULL`,
    [userId],
  );

  const roleCodes = [...new Set(roleRows.map((r) => r.code as string))];
  const isSuper = roleCodes.includes('super_admin');

  const permRows = await queryCol<string>(
    `SELECT DISTINCT p.code FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       JOIN roles r ON r.id = rp.role_id
      WHERE r.id IN (SELECT role_id FROM user_roles WHERE user_id = $1)`,
    [userId],
  );
  const permissions = new Set(permRows.map((p) => p));
  if (isSuper) permissions.add('*');

  // Branch scope: super admins see all; users with a branch_id are branch-scoped
  // unless they hold a role granted globally (branch_id NULL in user_roles).
  const globalRole = roleRows.some((r) => r.branch_id === null);
  const branchIds: string[] | null = isSuper || (u.branch_id === null && globalRole) ? null : [u.branch_id];

  // Leadership scoping
  const [ministryRows, groupRows] = await Promise.all([
    queryCol<string>(
      `SELECT DISTINCT mm.ministry_id FROM ministry_members mm
        JOIN ministries m ON m.id = mm.ministry_id AND m.deleted_at IS NULL
       WHERE mm.member_id = $1 AND mm.role IN ('leader','assistant') AND mm.is_active`,
      [u.member_id],
    ),
    queryCol<string>(
      `SELECT DISTINCT gm.group_id FROM group_members gm
        JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL
       WHERE gm.member_id = $1 AND gm.role IN ('leader','assistant') AND gm.is_active`,
      [u.member_id],
    ),
  ]);
  const ministryIds = ministryRows;
  const groupIds = groupRows;

  // Member visibility:
  //  - super_admin: all
  //  - pastor/admin/finance (branch staff): their branch (handled via branchIds)
  //  - ministry leader: members of their ministries (+ own branch context)
  //  - group leader: members of their groups
  //  - plain member: self only
  let memberIds: string[] | null = null;
  const hasScopedRole = roleCodes.some((c) => c === 'ministry_leader' || c === 'group_leader');
  if (!isSuper && !roleCodes.some((c) => ['pastor', 'admin', 'finance'].includes(c))) {
    const ids = new Set<string>();
    if (ministryIds.length > 0) {
      const rows = await queryCol<string>('SELECT member_id FROM ministry_members WHERE ministry_id = ANY($1::uuid[])', [ministryIds]);
      rows.forEach((r) => ids.add(r));
    }
    if (groupIds.length > 0) {
      const rows = await queryCol<string>('SELECT member_id FROM group_members WHERE group_id = ANY($1::uuid[])', [groupIds]);
      rows.forEach((r) => ids.add(r));
    }
    if (u.member_id) ids.add(u.member_id);
    memberIds = [...ids];
  }
  if (hasScopedRole) {
    // leaders still see branch context for things like registering attendees
  }

  return {
    userId: u.id,
    orgId: u.org_id,
    branchId: u.branch_id,
    branchIds,
    roleCodes,
    permissions,
    ministryIds,
    groupIds,
    isSuper,
    memberIds,
    linkedMemberId: u.member_id,
  };
}

export function hasPermission(scope: AccessScope, code: string): boolean {
  if (scope.isSuper) return true;
  return scope.permissions.has('*') || scope.permissions.has(code);
}

/**
 * Build a WHERE fragment restricting a members query to the user's scope.
 * Returns ['', []] when unrestricted.
 */
export function memberScopeWhere(scope: AccessScope): [string, unknown[]] {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (scope.memberIds !== null) {
    params.push(scope.memberIds.length > 0 ? scope.memberIds : [NIL_UUID]);
    parts.push(`m.id = ANY($${params.length}::uuid[])`);
  }
  if (scope.branchIds !== null) {
    params.push(scope.branchIds.length > 0 ? scope.branchIds : [NIL_UUID]);
    parts.push(`m.branch_id = ANY($${params.length}::uuid[])`);
  }
  if (parts.length === 0) return ['', []];
  return [` AND ${parts.join(' AND ')}`, params];
}

/** Branch scoping fragment for branch-keyed tables (branch_id column). */
// A structurally valid UUID that matches no row — used as the 'empty scope' sentinel.
// ('__none__' would fail the ::uuid[] cast with 22P02.)
const NIL_UUID = '00000000-0000-4000-8000-000000000000';

export function branchScopeWhere(scope: AccessScope, column = 'branch_id', paramIndex = 1): [string, unknown[]] {
  if (scope.branchIds === null) return ['', []];
  const params = [scope.branchIds.length > 0 ? scope.branchIds : [NIL_UUID]];
  return [` AND ${column} = ANY($${paramIndex}::uuid[])`, params];
}

/** Ministry scoping: ministry leaders see the ministries they lead;
 *  everyone else with branch scope sees their branch's ministries.
 *  Pass qualified columns (e.g. 'm.id', 'm.branch_id') when the query joins
 *  other tables that also have id/branch_id columns. */
export function ministryScopeWhere(scope: AccessScope, column = 'branch_id', idColumn = 'id'): [string, unknown[]] {
  if (scope.branchIds === null) return ['', []];
  const parts: string[] = [];
  const params: unknown[] = [];
  if (scope.ministryIds.length > 0 && !scope.isSuper && scope.roleCodes.some((c) => c === 'ministry_leader')) {
    params.push(scope.ministryIds);
    parts.push(`${idColumn} = ANY($${params.length}::uuid[])`);
    if (scope.branchIds) {
      params.push(scope.branchIds);
      parts.push(`${column} = ANY($${params.length}::uuid[])`);
    }
  } else if (scope.branchIds !== null) {
    params.push(scope.branchIds.length > 0 ? scope.branchIds : [NIL_UUID]);
    parts.push(`${column} = ANY($${params.length}::uuid[])`);
  }
  if (parts.length === 0) return ['', []];
  return [` AND ${parts.join(' AND ')}`, params];
}

/** Group scoping analogous to ministry scoping.
 *  Pass qualified column names (e.g. 'g.id', 'g.branch_id') when the query
 *  joins other tables that also have id/branch_id columns. */
export function groupScopeWhere(scope: AccessScope, column = 'branch_id', idColumn = 'id'): [string, unknown[]] {
  if (scope.branchIds === null) return ['', []];
  if (scope.groupIds.length > 0 && !scope.isSuper && scope.roleCodes.some((c) => c === 'group_leader')) {
    const params: unknown[] = [scope.groupIds];
    return [` AND ${idColumn} = ANY($1::uuid[])`, params];
  }
  return branchScopeWhere(scope, column);
}
