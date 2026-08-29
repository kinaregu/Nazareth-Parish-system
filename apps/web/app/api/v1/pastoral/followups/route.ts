import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { followupService } from '@nazareth/core';
import { createFollowupSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'followups.view');
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await followupService.listFollowups(c.scope, {
      status: p.status, assigned_to: p.assigned_to, priority: p.priority, source: p.source,
      mine: p.mine === 'true',
      page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'followups.create');
    const body = await parseBody(req, createFollowupSchema);
    const res = await followupService.createFollowup(c.scope, {
      subject_type: body.subject_type, subject_id: body.subject_id,
      member_id: body.member_id || undefined, reason: body.reason,
      assigned_to: body.assigned_to, due_date: body.due_date,
      priority: body.priority, note: body.note || undefined,
    }, c.ip);
    return NextResponse.json({ data: res }, { status: 201 });
  })(req);
}
