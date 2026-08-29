import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { query } from '@nazareth/db';

export const dynamic = 'force-dynamic';

/** List branches the caller can see (used by form selects).
 *  The branches table itself has no branch_id column, so branch-scoped
 *  callers are filtered on id. */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    if (!c.user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }, { status: 401 });
    }
    const branchIds: string[] | null = c.scope.branchIds;
    const data = await query<any>(
      branchIds
        ? `SELECT id, code, name, address, phone, email FROM branches WHERE is_active AND id = ANY($1::uuid[]) ORDER BY name`
        : `SELECT id, code, name, address, phone, email FROM branches WHERE is_active ORDER BY name`,
      branchIds ? [branchIds] : [],
    );
    return NextResponse.json({ data });
  })(req);
}
