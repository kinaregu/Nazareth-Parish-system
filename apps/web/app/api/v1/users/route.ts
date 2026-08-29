import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { userService } from '@nazareth/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const sp = req.nextUrl.searchParams;
    const res = await userService.listUsers(c.scope, {
      search: sp.get('search') ?? undefined,
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

/**
 * Create a user. A temporary password is generated and returned ONCE;
 * the user is forced to change it at first login.
 */
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  branch_id: z.string().uuid().nullable().optional(),
  member_id: z.string().uuid().nullable().optional(),
  role_codes: z.array(z.string().min(2).max(40)).min(1).max(5),
});

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, createSchema);
    const res = await userService.createUser(c.scope, {
      name: body.name, email: body.email, phone: body.phone || undefined,
      branch_id: body.branch_id || undefined, member_id: body.member_id || undefined, role_codes: body.role_codes,
    }, c.ip);
    return NextResponse.json({ data: res }, { status: 201 });
  })(req);
}
