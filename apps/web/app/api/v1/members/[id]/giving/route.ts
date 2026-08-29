import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, q } from '@/lib/api';
import { memberService, givingService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/**
 * A member's giving history — visible to:
 *  - the member themselves (portal, when the church enables self-view)
 *  - users holding giving.view (finance)
 * Never any other member's data.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const own = c.scope.linkedMemberId === params.id;
    const canView = c.scope.isSuper || c.scope.permissions.has('giving.view') || own;
    if (!canView) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to view this record.' } }, { status: 403 });
    }
    if (own) {
      // Portal self-view must be enabled by the church
      const org = await (await import('@nazareth/db')).queryOne<any>('SELECT settings FROM organizations WHERE id = $1', [c.scope.orgId]);
      if (!org?.settings?.member_self_view_giving) {
        return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Your church has not enabled personal giving history.' } }, { status: 403 });
      }
      const p = q(req.nextUrl.searchParams);
      const res = await givingService.ownGiving(c.scope, { from: p.from, to: p.to, page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25 });
      return NextResponse.json({ data: res.data, meta: res.meta, sum: res.sum });
    }
    await memberService.getMember(c.scope, params.id);
    const p = q(req.nextUrl.searchParams);
    const res = await givingService.listGiving(c.scope, {
      member_id: params.id, from: p.from, to: p.to, page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta, sum: res.sum });
  })(req);
}
