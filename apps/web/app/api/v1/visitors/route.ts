import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { visitorService } from '@nazareth/core';
import { createVisitorSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'visitors.view');
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await visitorService.listVisitors(c.scope, {
      search: p.search, status: p.status, branch_id: p.branch_id, from: p.from, to: p.to,
      page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'visitors.create');
    const body = await parseBody(req, createVisitorSchema);
    const v = await visitorService.createVisitor(c.scope, body as any, c.ip);
    return NextResponse.json({ data: v }, { status: 201 });
  })(req);
}
