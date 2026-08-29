import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { familyService } from '@nazareth/core';
import { createFamilySchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'families.view');
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await familyService.listFamilies(c.scope, {
      search: p.search, page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'families.create');
    const body = await parseBody(req, createFamilySchema);
    const fam = await familyService.createFamily(c.scope, body as any, c.ip);
    return NextResponse.json({ data: fam }, { status: 201 });
  })(req);
}
