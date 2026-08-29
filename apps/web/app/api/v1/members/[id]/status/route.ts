import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { memberService } from '@nazareth/core';
import { statusChangeSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'members.manage_status');
    const body = await parseBody(req, statusChangeSchema);
    const member = await memberService.changeMemberStatus(c.scope, params.id, body.status, body.reason, c.ip);
    return NextResponse.json({ data: member });
  })(req);
}
