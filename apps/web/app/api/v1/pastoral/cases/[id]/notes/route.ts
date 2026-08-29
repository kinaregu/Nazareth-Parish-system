import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { pastoralService } from '@nazareth/core';
import { pastoralNoteSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'pastoral.manage');
    const body = await parseBody(req, pastoralNoteSchema);
    const note = await pastoralService.addCaseNote(c.scope, params.id, body.body, body.sensitive, c.ip);
    return NextResponse.json({ data: note }, { status: 201 });
  })(req);
}
