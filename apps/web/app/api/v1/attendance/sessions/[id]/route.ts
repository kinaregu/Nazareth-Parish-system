import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { attendanceService } from '@nazareth/core';
import { saveAttendanceSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'attendance.view');
    const c = ctx as any;
    const res = await attendanceService.getSession(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}

/** Save attendance entries for the session (upsert per person). */
export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'attendance.manage');
    const body = await parseBody(req, saveAttendanceSchema);
    const res = await attendanceService.saveAttendance(c.scope, { session_id: params.id, entries: body.entries }, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
