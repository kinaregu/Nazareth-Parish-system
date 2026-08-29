import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { expenseService } from '@nazareth/core';
import { z } from 'zod';

const reasonSchema = z.object({ reason: z.string().trim().max(500).optional().or(z.literal('')) });

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, reasonSchema);
    const e = await expenseService.decideExpense(c.scope, params.id, 'approve', body.reason || undefined, c.ip);
    return NextResponse.json({ data: e });
  })(req);
}
