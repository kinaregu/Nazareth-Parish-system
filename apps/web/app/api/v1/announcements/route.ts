import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { announcementService } from '@nazareth/core';
import { createAnnouncementSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const forUser = p.forUser === 'true';
    const res = await announcementService.listAnnouncements(c.scope, {
      status: forUser ? undefined : p.status, page: p.page ? Number(p.page) : 1,
      pageSize: p.pageSize ? Number(p.pageSize) : 25, forUser,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'announcements.manage');
    const body = await parseBody(req, createAnnouncementSchema);
    const a = await announcementService.createAnnouncement(c.scope, body as any, c.ip);
    return NextResponse.json({ data: a }, { status: 201 });
  })(req);
}
