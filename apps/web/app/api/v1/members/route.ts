import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth, requirePerm, q, pageResponse, parseBody } from '@/lib/api';
import { memberService } from '@nazareth/core';
import { createMemberSchema } from '@nazareth/shared';
import { query, queryOne } from '@nazareth/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'members.view');
    const p = q(req.nextUrl.searchParams);
    const res = await memberService.listMembers(c.scope, {
      search: p.search, status: p.status, branch_id: p.branch_id, ministry_id: p.ministry_id,
      department_id: p.department_id, group_id: p.group_id, gender: p.gender as any,
      age_min: p.age_min ? Number(p.age_min) : undefined, age_max: p.age_max ? Number(p.age_max) : undefined,
      baptism_status: p.baptism_status as any, date_joined_from: p.date_joined_from, date_joined_to: p.date_joined_to,
      sort: p.sort, order: (p.order as any) ?? 'asc',
      page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return pageResponse(res.data, res.meta);
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'members.create');
    const body = await parseBody(req, createMemberSchema);
    const member = await memberService.createMember(c.scope, body as any, c.ip);
    return NextResponse.json({ data: member }, { status: 201 });
  })(req);
}
