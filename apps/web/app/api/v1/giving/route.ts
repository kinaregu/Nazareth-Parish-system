import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { givingService } from '@nazareth/core';
import { createGivingSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'giving.view');
    const p = q(req.nextUrl.searchParams);
    const res = await givingService.listGiving(c.scope, {
      member_id: p.member_id, fund_id: p.fund_id, method: p.method,
      from: p.from, to: p.to,
      page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta, sum: res.sum });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'giving.create');
    const body = await parseBody(req, createGivingSchema);
    const g = await givingService.createGiving(c.scope, {
      branch_id: body.branch_id, fund_id: body.fund_id, member_id: body.member_id || undefined,
      amount: body.amount, tx_date: body.tx_date, method: body.method,
      reference: body.reference || undefined, is_anonymous: body.is_anonymous,
      note: body.note || undefined, issue_receipt: true,
    }, c.ip);
    return NextResponse.json({ data: g }, { status: 201 });
  })(req);
}
