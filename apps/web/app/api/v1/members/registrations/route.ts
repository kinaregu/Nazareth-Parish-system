import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth, q } from '@/lib/api';
import { registrationService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await registrationService.listRegistrations(c.scope, {
      status: p.status, page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}
