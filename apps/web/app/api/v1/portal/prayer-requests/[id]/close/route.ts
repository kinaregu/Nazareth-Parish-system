import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth } from '@/lib/api';
import { prayerService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** Withdraw one's own active prayer request. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const res = await prayerService.closeOwnRequest(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}
