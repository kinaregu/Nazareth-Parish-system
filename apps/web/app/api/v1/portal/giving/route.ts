import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth, q } from '@/lib/api';
import { givingService } from '@nazareth/core';
import { queryOne } from '@nazareth/db';

export const dynamic = 'force-dynamic';

/**
 * Member portal — my own giving (opt-in, per church setting).
 * Requires the caller to have a linked member profile.
 */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const org = await queryOne<any>('SELECT settings FROM organizations WHERE id = $1', [c.scope.orgId]);
    if (!org?.settings?.member_self_view_giving) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Your church has not enabled personal giving history.' } }, { status: 403 });
    }
    if (!c.scope.linkedMemberId) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No member profile is linked to your account.' } }, { status: 404 });
    }
    const p = q(req.nextUrl.searchParams);
    const res = await givingService.ownGiving(c.scope, { from: p.from, to: p.to, page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25 });
    return NextResponse.json({ data: res.data, meta: res.meta, sum: res.sum });
  })(req);
}
