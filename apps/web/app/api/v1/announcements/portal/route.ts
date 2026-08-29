import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth } from '@/lib/api';
import { announcementService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** Audience-targeted announcements for the signed-in user's member profile. */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const data = await announcementService.memberAnnouncements(c.scope, c.scope.linkedMemberId ?? '');
    return NextResponse.json({ data });
  })(req);
}
