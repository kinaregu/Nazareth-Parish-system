import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth } from '@/lib/api';
import { memberService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** Duplicate detection (name/phone/email/dob) shown before creating a member. */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requireAuth(ctx);
    const c = ctx as any;
    const p = req.nextUrl.searchParams;
    const dups = await memberService.findDuplicates(c.scope, {
      first_name: p.get('first_name') ?? '',
      last_name: p.get('last_name') ?? '',
      phone: p.get('phone') ?? undefined,
      email: p.get('email') ?? undefined,
      date_of_birth: p.get('dob') ?? undefined,
    });
    return NextResponse.json({ data: dups });
  })(req);
}
