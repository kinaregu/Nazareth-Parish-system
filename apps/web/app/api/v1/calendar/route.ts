import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { eventService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const sp = req.nextUrl.searchParams;
    const from = sp.get('from') ?? new Date().toISOString().slice(0, 10);
    const to = sp.get('to') ?? new Date().toISOString().slice(0, 10);
    const res = await eventService.calendar(c.scope, from, to);
    return NextResponse.json({ data: res.items });
  })(req);
}
