import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { memberService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    await memberService.getMember(c.scope, params.id);
    const family = await memberService.getMemberFamily(c.scope, params.id);
    return NextResponse.json({ data: family });
  })(req);
}
