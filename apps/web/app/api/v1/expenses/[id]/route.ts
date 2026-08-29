import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { expenseService } from '@nazareth/core';
import { updateExpenseSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'expenses.view');
    const c = ctx as any;
    const e = await expenseService.getExpense(c.scope, params.id);
    return NextResponse.json({ data: e });
  })(req);
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'expenses.create');
    const body = await parseBody(req, updateExpenseSchema);
    const e = await expenseService.updateExpense(c.scope, params.id, {
      fund_id: body.fund_id, category_id: body.category_id, title: body.title,
      description: body.description || undefined, amount: body.amount,
      expense_date: body.expense_date, vendor: body.vendor || undefined,
      method: body.method, reference: body.reference || undefined,
    }, c.ip);
    return NextResponse.json({ data: e });
  })(req);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'expenses.create');
    const res = await expenseService.archiveExpense(c.scope, params.id, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}

/** Submit a draft (or rejected) expense for approval. */
export async function POST(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'expenses.create');
    const e = await expenseService.submitExpense(c.scope, params.id, c.ip);
    return NextResponse.json({ data: e });
  })(req);
}
