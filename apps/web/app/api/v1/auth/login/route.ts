import { NextResponse, type NextRequest } from 'next/server';
import { withCtx, handleError, sessionCookies } from '@/lib/api';
import { auth } from '@nazareth/core';
import { parseBody } from '@/lib/api';
import { loginSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const body = await parseBody(req, loginSchema);
    const anon = ctx as { ip: string; ua: string };
    const res = await auth.login({
      email: body.email,
      password: body.password,
      remember: body.remember,
      ip: anon.ip,
      userAgent: anon.ua,
      totpCode: body.totpCode,
    });
    if (res.totpRequired) {
      return NextResponse.json({ data: { totpRequired: true, email: res.user.email } });
    }
    const out = NextResponse.json({
      data: {
        totpRequired: false,
        // Raw session token for the `Authorization: Bearer` channel (SPA / mobile app).
        token: res.token,
        user: {
          id: res.user.id, name: res.user.name, email: res.user.email, member_id: res.user.member_id,
          must_change_password: res.user.must_change_password,
        },
      },
    });
    sessionCookies(out, res.token, Boolean(body.remember));
    return out;
  })(req);
}
