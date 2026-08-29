import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { visitorService } from '@nazareth/core';
import { visitorConvertSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'visitors.convert');
    const body = await parseBody(req, visitorConvertSchema);
    const result = await visitorService.convertVisitor(c.scope, params.id, body as any, c.ip);
    return NextResponse.json({ data: result }, { status: 201 });
  })(req);
}
