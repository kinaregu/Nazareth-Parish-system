import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { auth } from '@nazareth/core';
import { resetPasswordSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const body = await parseBody(req, resetPasswordSchema);
    await auth.resetPassword(body.token, body.password);
    return NextResponse.json({ data: { ok: true } });
  })(req);
}
