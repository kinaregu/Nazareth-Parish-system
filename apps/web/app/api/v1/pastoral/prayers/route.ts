import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { prayerService } from '@nazareth/core';
import { createPrayerSchema } from '@nazareth/shared';
import { ratelimit } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** List prayer requests visible to the caller (prayer.view). */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'prayer.view');
    const c = ctx as any;
    const sp = req.nextUrl.searchParams;
    const res = await prayerService.listPrayerRequests(c.scope, {
      status: sp.get('status') ?? undefined,
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : 50,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

/**
 * Submit a prayer request.
 * Anyone signed in (member/visitor with an account) may submit;
 * staff get the pastoral.ministers visibility options via the UI.
 */
export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, createPrayerSchema);
    const rl = ratelimit.rateLimit(`prayer:${c.userId}`, { max: 10, windowMs: 60 * 60_000 });
    if (!rl.ok) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many prayer requests.' } }, { status: 429 });
    const res = await prayerService.createPrayerRequest(c.scope, {
      text: body.text,
      category: body.category,
      visibility: body.visibility,
      ministry_id: body.ministry_id || undefined,
      group_id: body.group_id || undefined,
    }, c.ip);
    return NextResponse.json({ data: res }, { status: 201 });
  })(req);
}
