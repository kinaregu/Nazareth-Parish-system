import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { orgService } from '@nazareth/core';
import { updateMinistrySchema, ministryMembersSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const res = await orgService.getMinistry(c.scope, params.id);
    return NextResponse.json({ data: res });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, updateMinistrySchema);
    const res = await orgService.updateMinistry(c.scope, params.id, body as any, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const res = await orgService.archiveMinistry(c.scope, params.id, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}

/** Replace the ministry's membership roster. */
export async function POST(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, ministryMembersSchema);
    const res = await orgService.setMinistryMembers(c.scope, params.id, body.entries, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
