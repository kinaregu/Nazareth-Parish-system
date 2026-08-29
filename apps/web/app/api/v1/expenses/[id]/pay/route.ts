import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { expenseService } from '@nazareth/core';
import { expensePaySchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, expensePaySchema);
    const e = await expenseService.markPaid(c.scope, params.id, body.paid_at, c.ip);
    return NextResponse.json({ data: e });
  })(req);
}
