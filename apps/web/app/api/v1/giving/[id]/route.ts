import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { givingService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

/**
 * Reverse a giving record — finance/super-admin only.
 * Creates a linked reversal row; the original is never mutated.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    if (!c.scope.isSuper && !c.scope.permissions.has('giving.view')) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to reverse giving.' } }, { status: 403 });
    }
    const res = await givingService.reverseGiving(c.scope, params.id, 'Reversed by admin');
    return NextResponse.json({ data: res });
  })(req);
}
