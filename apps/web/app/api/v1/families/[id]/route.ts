import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { familyService } from '@nazareth/core';
import { updateFamilySchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'families.view');
    const c = ctx as any;
    const res = await familyService.getFamily(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'families.edit');
    const body = await parseBody(req, updateFamilySchema);
    const fam = await familyService.updateFamily(c.scope, params.id, body as any, c.ip);
    return NextResponse.json({ data: fam });
  })(req);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'families.delete');
    const result = await familyService.archiveFamily(c.scope, params.id, c.ip);
    return NextResponse.json({ data: result });
  })(req);
}
