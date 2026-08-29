import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody, requireAuth } from '@/lib/api';
import { auth } from '@nazareth/core';
import { changePasswordSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const body = await parseBody(req, changePasswordSchema);
    await auth.changePassword(c.user.id, body.currentPassword, body.newPassword);
    return NextResponse.json({ data: { ok: true } });
  })(req);
}
