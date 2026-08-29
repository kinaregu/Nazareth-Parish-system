import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody, requireAuth } from '@/lib/api';
import { auth } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  try {
    await auth.verifyEmail(token);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'This verification link is invalid or has expired.' } }, { status: 422 });
  }
}

/** Resend the verification email (authenticated). */
export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    await auth.sendVerificationEmail(c.user.id);
    return NextResponse.json({ data: { ok: true } });
  })(req);
}
