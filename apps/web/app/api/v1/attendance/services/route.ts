import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { attendanceService } from '@nazareth/core';
import { createServiceSchema, updateServiceSchema } from '@nazareth/shared';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'attendance.view');
    const c = ctx as any;
    const data = await attendanceService.listServices(c.scope, { includeInactive: true });
    return NextResponse.json({ data });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'attendance.manage');
    const body = await parseBody(req, createServiceSchema);
    const s = await attendanceService.createService(c.scope, body as any, c.ip);
    return NextResponse.json({ data: s }, { status: 201 });
  })(req);
}

/** Update a service by ?id= (kept flat to avoid another route dir). */
export async function PUT(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'attendance.manage');
    const body = await parseBody(req, z.object({ id: z.string().uuid() }).merge(updateServiceSchema));
    const s = await attendanceService.updateService(c.scope, body.id, body as any, c.ip);
    return NextResponse.json({ data: s });
  })(req);
}
