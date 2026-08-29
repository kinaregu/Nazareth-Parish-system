import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { userService } from '@nazareth/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const res = await userService.getUser(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, z.object({
      name: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      branch_id: z.string().uuid().nullable().optional(),
      member_id: z.string().uuid().nullable().optional(),
      role_codes: z.array(z.string().min(2).max(40)).min(1).max(5).optional(),
      active: z.boolean().optional(),
      must_change_password: z.boolean().optional(),
    }));
    const res = await userService.updateUser(c.scope, params.id, body as any, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}

/** Deactivate (soft). Use PUT {active:true} to re-activate. */
export async function DELETE(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const res = await userService.deactivateUser(c.scope, params.id, false, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
