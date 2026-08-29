import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { expenseService } from '@nazareth/core';
import { createExpenseSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'expenses.view');
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await expenseService.listExpenses(c.scope, {
      status: p.status, fund_id: p.fund_id, category_id: p.category_id, from: p.from, to: p.to,
      page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'expenses.create');
    const body = await parseBody(req, createExpenseSchema);
    const e = await expenseService.createExpense(c.scope, {
      branch_id: body.branch_id, fund_id: body.fund_id, category_id: body.category_id,
      title: body.title, description: body.description || undefined,
      amount: body.amount, expense_date: body.expense_date,
      vendor: body.vendor || undefined, method: body.method, reference: body.reference || undefined,
      submit: body.submit,
    }, c.ip);
    return NextResponse.json({ data: e }, { status: 201 });
  })(req);
}
