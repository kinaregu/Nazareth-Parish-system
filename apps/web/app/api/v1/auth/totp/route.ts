import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody, requireAuth } from '@/lib/api';
import { totpSetupUri } from '@nazareth/core';
import { auth } from '@nazareth/core';
import { totpEnableSchema } from '@nazareth/shared';
import { queryOne } from '@nazareth/db';

export const dynamic = 'force-dynamic';

/** Start 2FA enrollment: returns secret + otpauth URI + QR data URL. */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const org = (await queryOne<any>('SELECT name FROM organizations WHERE id = $1', [c.scope.orgId]))?.name ?? 'Church';
    const setup = await totpSetupUri(c.user.email, org);
    return NextResponse.json({ data: setup });
  })(req);
}

/** Confirm enrollment with a 6-digit code. */
export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const body = await parseBody(req, totpEnableSchema);
    await auth.totpEnable(c.user.id, body.code);
    return NextResponse.json({ data: { ok: true } });
  })(req);
}

/** Disable 2FA (password required). */
export async function DELETE(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const body = await parseBody<{ password: string }>(req);
    await auth.totpDisable(c.user.id, body.password);
    return NextResponse.json({ data: { ok: true } });
  })(req);
}
