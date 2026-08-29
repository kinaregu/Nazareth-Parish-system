import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { orgService } from '@nazareth/core';
import { createDepartmentSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'departments.view');
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await orgService.listDepartments(c.scope, {
      search: p.search, page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'departments.manage');
    const body = await parseBody(req, createDepartmentSchema);
    const d = await orgService.createDepartment(c.scope, body as any, c.ip);
    return NextResponse.json({ data: d }, { status: 201 });
  })(req);
}
