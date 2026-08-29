import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm } from '@/lib/api';
import { attendanceService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'attendance.view');
    const c = ctx as any;
    const sp = req.nextUrl.searchParams;
    const [trend, byService] = await Promise.all([
      attendanceService.attendanceTrend(c.scope, Number(sp.get('weeks') ?? 12), sp.get('service_id') ?? undefined),
      attendanceService.attendanceByService(c.scope, 8),
    ]);
    return NextResponse.json({ data: { trend, byService } });
  })(req);
}
