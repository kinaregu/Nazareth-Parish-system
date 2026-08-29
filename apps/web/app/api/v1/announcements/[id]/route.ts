import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { announcementService } from '@nazareth/core';
import { updateAnnouncementSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const a = await announcementService.getAnnouncement(c.scope, params.id);
    return NextResponse.json({ data: a });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, updateAnnouncementSchema);
    const a = await announcementService.updateAnnouncement(c.scope, params.id, body as any, c.ip);
    return NextResponse.json({ data: a });
  })(req);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const res = await announcementService.archiveAnnouncement(c.scope, params.id, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
