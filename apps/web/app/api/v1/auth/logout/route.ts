import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { withCtx, clearSessionCookies } from '@/lib/api';
import { auth } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const token = cookies().get('chms_session')?.value;
    if (token) await auth.logout(token, (ctx as any).user?.id, (ctx as any).ip);
    const res = NextResponse.json({ data: { ok: true } });
    clearSessionCookies(res);
    return res;
  })(req);
}
