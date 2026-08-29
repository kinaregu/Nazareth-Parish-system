import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { dashboardService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** Role-customized dashboard payload (stat cards, charts, quick actions, alerts). */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const data = await dashboardService.getDashboard(c.scope);
    return NextResponse.json({ data });
  })(req);
}
