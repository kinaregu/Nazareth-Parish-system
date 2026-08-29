import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { followupService } from '@nazareth/core';
import { updateFollowupSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'followups.view');
    const c = ctx as any;
    const res = await followupService.getFollowup(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'followups.manage');
    const body = await parseBody(req, updateFollowupSchema);
    const res = await followupService.updateFollowup(c.scope, params.id, {
      status: body.status,
      outcome: body.outcome || undefined,
      note: body.note || undefined,
    }, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
