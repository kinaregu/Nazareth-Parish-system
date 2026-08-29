import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { pastoralService } from '@nazareth/core';
import { updatePastoralCaseSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'pastoral.view');
    const c = ctx as any;
    const res = await pastoralService.getCase(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'pastoral.manage');
    const body = await parseBody(req, updatePastoralCaseSchema);
    const res = await pastoralService.updateCase(c.scope, params.id, {
      status: body.status,
      assigned_to: body.assigned_to || undefined,
      resolution: body.resolution || undefined,
    }, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
