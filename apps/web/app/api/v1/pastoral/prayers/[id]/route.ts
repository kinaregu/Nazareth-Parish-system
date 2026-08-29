import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { prayerService } from '@nazareth/core';
import { managePrayerSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const res = await prayerService.getPrayerRequest(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, managePrayerSchema);
    const res = await prayerService.managePrayerRequest(c.scope, params.id, {
      status: body.status,
      assigned_to: body.assigned_to || undefined,
    }, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
