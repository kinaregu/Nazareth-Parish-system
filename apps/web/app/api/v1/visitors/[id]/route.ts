import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { visitorService } from '@nazareth/core';
import { updateVisitorSchema } from '@nazareth/shared';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'visitors.view');
    const c = ctx as any;
    const res = await visitorService.getVisitor(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'visitors.edit');
    const body = await parseBody(req, updateVisitorSchema);
    const v = await visitorService.updateVisitor(c.scope, params.id, body as any, c.ip);
    return NextResponse.json({ data: v });
  })(req);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'visitors.edit');
    const c = ctx as any;
    await visitorService.getVisitor(c.scope, params.id);
    const { query } = await import('@nazareth/db');
    const { audit } = await import('@nazareth/core');
    await query('UPDATE visitors SET deleted_at = now() WHERE id = $1', [params.id]);
    await audit({ userId: c.userId, orgId: c.orgId, action: 'visitor.delete', entity: 'visitor', entityId: params.id, ip: c.ip, metadata: { soft: true } });
    return NextResponse.json({ data: { id: params.id } });
  })(req);
}

/** Record a follow-up contact on the visitor. */
export async function POST(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'visitors.edit');
    const body = await parseBody(req, z.object({ note: z.string().trim().min(1).max(2000), outcome: z.string().trim().max(120).optional() }));
    const res = await visitorService.addVisitorFollowup(c.scope, params.id, body.note, body.outcome, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
