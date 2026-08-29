import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { givingService } from '@nazareth/core';
import { createFundSchema, updateFundSchema } from '@nazareth/shared';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'funds.manage');
    const c = ctx as any;
    const data = await givingService.listFunds(c.scope, { includeInactive: true });
    return NextResponse.json({ data });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'funds.manage');
    const body = await parseBody(req, createFundSchema);
    const f = await givingService.createFund(c.scope, { ...body, description: body.description || undefined }, c.ip);
    return NextResponse.json({ data: f }, { status: 201 });
  })(req);
}

export async function PUT(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'funds.manage');
    const body = await parseBody(req, z.object({ id: z.string().uuid() }).merge(updateFundSchema));
    const f = await givingService.updateFund(c.scope, body.id, { ...body, description: body.description || undefined }, c.ip);
    return NextResponse.json({ data: f });
  })(req);
}
