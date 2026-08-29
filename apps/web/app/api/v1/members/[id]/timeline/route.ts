import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth } from '@/lib/api';
import { memberService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    // Scoping enforced inside service (member must be visible to the caller).
    await memberService.getMember(c.scope, params.id);
    const timeline = await memberService.getMemberTimeline(c.scope, params.id);
    return NextResponse.json({ data: timeline });
  })(req);
}
