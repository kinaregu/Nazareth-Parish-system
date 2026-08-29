import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { orgService } from '@nazareth/core';
import { createGroupSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'groups.view');
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await orgService.listGroups(c.scope, {
      search: p.search, page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'groups.manage');
    const body = await parseBody(req, createGroupSchema);
    const g = await orgService.createGroup(c.scope, body as any, c.ip);
    return NextResponse.json({ data: g }, { status: 201 });
  })(req);
}
