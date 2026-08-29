import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { expenseService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    if (!c.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }, { status: 401 });
    const data = await expenseService.listCategories(c.scope);
    return NextResponse.json({ data });
  })(req);
}
