import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { eventService } from '@nazareth/core';
import { updateEventSchema, registerForEventSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const res = await eventService.getEvent(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, updateEventSchema);
    const res = await eventService.updateEvent(c.scope, params.id, body as any, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const res = await eventService.archiveEvent(c.scope, params.id, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}

/** A member registers for the event (uses their linked member profile). */
export async function POST(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, registerForEventSchema);
    const reg = await eventService.registerForEvent(c.scope, { event_id: params.id, status: body.status, note: body.note }, c.scope.linkedMemberId, c.ip);
    return NextResponse.json({ data: reg }, { status: 201 });
  })(req);
}
