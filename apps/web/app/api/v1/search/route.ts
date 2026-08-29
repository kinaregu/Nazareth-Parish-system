import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { query } from '@nazareth/db';
import { branchScopeWhere } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/**
 * Global search — members, families, events, ministries, groups.
 * Results respect the caller's branch scope; pastoral/financial data is never
 * part of search results.
 *
 * Each subquery uses its own scope fragment bound at $2 (the search term is
 * $1) with a qualified branch column, so joins can never make `branch_id`
 * ambiguous.
 */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
    if (q.length < 2) return NextResponse.json({ data: [] });
    const term = `%${q.replace(/[%_]/g, '')}%`;

    const [swM, spM] = branchScopeWhere(c.scope, 'm.branch_id', 2);
    const [swF, spF] = branchScopeWhere(c.scope, 'f.branch_id', 2);
    const [swE, spE] = branchScopeWhere(c.scope, 'e.branch_id', 2);
    const [swMin, spMin] = branchScopeWhere(c.scope, 'm.branch_id', 2);
    const [swG, spG] = branchScopeWhere(c.scope, 'g.branch_id', 2);

    const [members, families, events, ministries, groups] = await Promise.all([
      c.scope.isSuper || c.scope.permissions.has('members.view')
        ? query<any>(
            `SELECT id, kind, member_no, name, sub, link
               FROM (
                 SELECT m.id, 'member' AS kind, m.member_no,
                        m.first_name || ' ' || COALESCE(m.middle_name, '') || ' ' || m.last_name AS name,
                        m.status || ' ' || COALESCE(m.phone, '') AS sub,
                        '/members/' || m.id AS link
                 FROM members m
                 WHERE m.deleted_at IS NULL AND (m.first_name ILIKE $1 OR m.last_name ILIKE $1 OR m.member_no ILIKE $1
                        OR COALESCE(m.phone, '') ILIKE $1 OR COALESCE(m.email, '') ILIKE $1)${swM}
                 ORDER BY m.first_name LIMIT 8
               ) s`,
            [term, ...spM],
          )
        : Promise.resolve([]),
      c.scope.isSuper || c.scope.permissions.has('families.view')
        ? query<any>(
            `SELECT f.id, 'family' AS kind, f.name,
                    (SELECT m.first_name || ' ' || m.last_name FROM members m WHERE m.id = f.primary_contact_id) AS head_name,
                    '/families/' || f.id AS link
               FROM families f
              WHERE f.deleted_at IS NULL AND f.name ILIKE $1${swF}
              ORDER BY f.name LIMIT 5`,
            [term, ...spF],
          )
        : Promise.resolve([]),
      c.scope.isSuper || c.scope.permissions.has('events.view')
        ? query<any>(
            `SELECT e.id, 'event' AS kind, e.title, to_char(e.starts_at, 'DD MMM YYYY') AS sub, '/events/' || e.id AS link
               FROM events e
              WHERE e.deleted_at IS NULL AND e.title ILIKE $1${swE}
              ORDER BY e.starts_at DESC LIMIT 5`,
            [term, ...spE],
          )
        : Promise.resolve([]),
      c.scope.isSuper || c.scope.permissions.has('ministries.view')
        ? query<any>(
            `SELECT m.id, 'ministry' AS kind, m.name, COALESCE(l.name, '') AS sub, '/ministries/' || m.id AS link
               FROM ministries m
               LEFT JOIN LATERAL (SELECT first_name || ' ' || last_name AS name FROM members WHERE id = m.leader_id) l ON true
              WHERE m.deleted_at IS NULL AND m.name ILIKE $1${swMin}
              ORDER BY m.name LIMIT 5`,
            [term, ...spMin],
          )
        : Promise.resolve([]),
      c.scope.isSuper || c.scope.permissions.has('groups.view')
        ? query<any>(
            `SELECT g.id, 'group' AS kind, g.name, g.meeting_day || ' ' || COALESCE(g.meeting_time, '') AS meeting_pattern, '/groups/' || g.id AS link
               FROM groups g
              WHERE g.deleted_at IS NULL AND g.name ILIKE $1${swG}
              ORDER BY g.name LIMIT 5`,
            [term, ...spG],
          )
        : Promise.resolve([]),
    ]);

    const data = [...members, ...families, ...events, ...ministries, ...groups];
    return NextResponse.json({ data });
  })(req);
}
