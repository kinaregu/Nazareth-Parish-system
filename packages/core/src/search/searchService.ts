/**
 * @nazareth/core — global search.
 * Only returns record types the user is permitted to see, and each sub-query
 * inherits the caller's branch scope. Never returns unauthorized records.
 */
import { query } from '@nazareth/db';
import { hasPermission, type AccessScope, memberScopeWhere, branchScopeWhere } from '../rbac/scope';

export interface SearchResults {
  members: any[];
  families: any[];
  visitors: any[];
  groups: any[];
  ministries: any[];
  events: any[];
}

export async function globalSearch(scope: AccessScope, q: string): Promise<SearchResults> {
  const term = `%${q.trim()}%`;
  const empty: SearchResults = { members: [], families: [], visitors: [], groups: [], ministries: [], events: [] };
  if (q.trim().length < 2) return empty;
  const results: SearchResults = { ...empty };

  const [bsw,bsp] = branchScopeWhere(scope);
  const branchFilter = `AND branch_id = ANY($2::uuid[])`;
  const branchParam = scope.branchIds ?? [];

  if (hasPermission(scope, 'members.view')) {
    // memberScopeWhere emits fragments on alias `m` (m.id / m.branch_id),
    // so the table must carry that alias; its params are exactly `msp`,
    // renumbered +1 to leave $1 for the search term.
    const [msw, msp] = memberScopeWhere(scope);
    results.members = await query<any>(
      `SELECT m.id, m.member_no, m.first_name || ' ' || COALESCE(m.middle_name,'') || ' ' || m.last_name AS name, m.email, m.phone, m.status
         FROM members m
        WHERE m.deleted_at IS NULL
          AND (m.last_name ILIKE $1 OR m.first_name ILIKE $1 OR m.member_no ILIKE $1 OR m.email ILIKE $1 OR m.phone ILIKE $1)
          ${msw.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 2}`)}
        ORDER BY m.last_name LIMIT 8`,
      [term, ...msp],
    );
  }
  if (hasPermission(scope, 'families.view')) {
    results.families = await query<any>(
      `SELECT id, name, address, city FROM families
        WHERE deleted_at IS NULL AND (name ILIKE $1 OR address ILIKE $1) AND (branch_id = ANY($2::uuid[]) OR $3::boolean)
        LIMIT 5`,
      [term, scope.branchIds ?? [], scope.branchIds === null],
    );
  }
  if (hasPermission(scope, 'visitors.view')) {
    results.visitors = await query<any>(
      `SELECT id, first_name || ' ' || COALESCE(last_name, '') AS name, email, phone, visit_date, followup_status
         FROM visitors
        WHERE deleted_at IS NULL AND (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)
          AND (branch_id = ANY($2::uuid[]) OR $3::boolean)
        ORDER BY visit_date DESC LIMIT 5`,
      [term, scope.branchIds ?? [], scope.branchIds === null],
    );
  }
  if (hasPermission(scope, 'groups.view') || scope.roleCodes.includes('group_leader')) {
    results.groups = await query<any>(
      `SELECT id, name, type, meeting_day FROM groups
        WHERE deleted_at IS NULL AND name ILIKE $1
          AND (branch_id = ANY($2::uuid[]) OR $3::boolean)
          AND (id = ANY($4::uuid[]) OR $5::boolean)
        LIMIT 5`,
      [term, scope.branchIds ?? [], scope.branchIds === null,
       scope.roleCodes.includes('group_leader') ? scope.groupIds : [], scope.roleCodes.includes('group_leader') ? false : true],
    );
  }
  if (hasPermission(scope, 'ministries.view')) {
    results.ministries = await query<any>(
      `SELECT id, name, description FROM ministries
        WHERE deleted_at IS NULL AND (name ILIKE $1 OR description ILIKE $1)
          AND (branch_id = ANY($2::uuid[]) OR $3::boolean)
        LIMIT 5`,
      [term, scope.branchIds ?? [], scope.branchIds === null],
    );
  }
  if (hasPermission(scope, 'events.view')) {
    results.events = await query<any>(
      `SELECT id, title, starts_at, location, status FROM events
        WHERE deleted_at IS NULL AND title ILIKE $1 AND status IN ('published','draft')
          AND (branch_id = ANY($2::uuid[]) OR $3::boolean)
        ORDER BY starts_at DESC LIMIT 5`,
      [term, scope.branchIds ?? [], scope.branchIds === null],
    );
  }
  return results;
}
