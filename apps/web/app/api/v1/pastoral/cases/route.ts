import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { pastoralService } from '@nazareth/core';
import { createPastoralCaseSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'pastoral.view');
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await pastoralService.listCases(c.scope, {
      status: p.status, member_id: p.member_id,
      page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'pastoral.manage');
    const body = await parseBody(req, createPastoralCaseSchema);
    const res = await pastoralService.createCase(c.scope, {
      member_id: body.member_id, type: body.type, title: body.title,
      assigned_to: body.assigned_to || undefined,
    }, c.ip);
    return NextResponse.json({ data: res }, { status: 201 });
  })(req);
}
