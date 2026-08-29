import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { memberService, attendanceService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    // Only allow the member's own history, or staff with attendance.view.
    const own = c.scope.linkedMemberId === params.id;
    if (!own && !c.scope.isSuper && !c.scope.permissions.has('attendance.view')) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to view this record.' } }, { status: 403 });
    }
    await memberService.getMember(c.scope, params.id);
    const history = await attendanceService.memberAttendanceHistory(c.scope, params.id);
    const rate = await attendanceService.memberAttendanceRate(c.scope, params.id);
    return NextResponse.json({ data: { history, rate } });
  })(req);
}
