import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { auth } from '@nazareth/core';
import { forgotPasswordSchema } from '@nazareth/shared';
import { ratelimit } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const body = await parseBody(req, forgotPasswordSchema);
    const rl = ratelimit.rateLimit(`reset:${(ctx as any).ip}`, { max: 5, windowMs: 15 * 60_000 });
    if (!rl.ok) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } }, { status: 429 });
    await auth.requestPasswordReset(body.email);
    // Uniform response — never reveal whether the account exists.
    return NextResponse.json({ data: { ok: true } });
  })(req);
}
