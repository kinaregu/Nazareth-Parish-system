import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { memberService } from '@nazareth/core';
import { updateMemberSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'members.view');
    const c = ctx as any;
    const member = await memberService.getMember(c.scope, params.id);
    return NextResponse.json({ data: member });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'members.edit');
    const body = await parseBody(req, updateMemberSchema);
    const member = await memberService.updateMember(c.scope, params.id, body as any, c.ip);
    return NextResponse.json({ data: member });
  })(req);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'members.delete');
    const result = await memberService.archiveMember(c.scope, params.id, c.ip);
    return NextResponse.json({ data: result });
  })(req);
}
