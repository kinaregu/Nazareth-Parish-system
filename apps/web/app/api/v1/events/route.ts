import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { eventService } from '@nazareth/core';
import { createEventSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'events.view');
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await eventService.listEvents(c.scope, {
      from: p.from, to: p.to, status: p.status, ministry_id: p.ministry_id, group_id: p.group_id,
      page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'events.manage');
    const body = await parseBody(req, createEventSchema);
    const e = await eventService.createEvent(c.scope, body as any, c.ip);
    return NextResponse.json({ data: e }, { status: 201 });
  })(req);
}
