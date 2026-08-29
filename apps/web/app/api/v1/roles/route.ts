import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm } from '@/lib/api';
import { query } from '@nazareth/db';
import { SYSTEM_ROLES, DEFAULT_ROLE_PERMISSIONS } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

/** Role catalog: system role definitions + org role rows + user counts. */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'roles.manage');
    const c = ctx as any;
    const [orgRoles, counts] = await Promise.all([
      query<any>('SELECT id, code, name, description FROM roles WHERE org_id = $1 AND deleted_at IS NULL ORDER BY name', [c.scope.orgId]),
      query<any>(`SELECT r.code AS role, COUNT(*)::int AS users
                    FROM user_roles ur JOIN users u ON u.id = ur.user_id
                    JOIN roles r ON r.id = ur.role_id
                   WHERE u.deleted_at IS NULL GROUP BY r.code`),
    ]);
    const countMap = new Map(counts.map((r) => [r.role, r.users]));
    const orgByCode = new Map(orgRoles.map((r) => [r.code, r]));
    const data = SYSTEM_ROLES.map((r) => ({
      code: r.code,
      name: orgByCode.get(r.code)?.name ?? r.name,
      description: orgByCode.get(r.code)?.description ?? r.description,
      role_id: orgByCode.get(r.code)?.id ?? null,
      users: countMap.get(r.code) ?? 0,
      permissions: DEFAULT_ROLE_PERMISSIONS[r.code] ?? [],
    }));
    return NextResponse.json({ data });
  })(req);
}
