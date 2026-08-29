import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth } from '@/lib/api';
import { prayerService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** The signed-in user's own prayer requests (portal). */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const data = await prayerService.ownPrayerRequests(c.scope);
    return NextResponse.json({ data });
  })(req);
}
