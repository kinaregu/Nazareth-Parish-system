import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { userService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/**
 * Admin reset: generates a temporary password (returned once),
 * invalidates all sessions for that user, forces password change at next login.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const res = await userService.resetUserPassword(c.scope, params.id, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
