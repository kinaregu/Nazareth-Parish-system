import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q, parseBody } from '@/lib/api';
import { attendanceService } from '@nazareth/core';
import { query, queryOne } from '@nazareth/db';
import { createSessionSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'attendance.view');
    const c = ctx as any;
    const p = q(req.nextUrl.searchParams);
    const res = await attendanceService.listSessions(c.scope, {
      service_id: p.service_id, from: p.from, to: p.to,
      page: p.page ? Number(p.page) : 1, pageSize: p.pageSize ? Number(p.pageSize) : 25,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}

/** Create an attendance session for a service + date. */
export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'attendance.manage');
    const body = await parseBody(req, createSessionSchema);
    const service = await queryOne<any>('SELECT * FROM services WHERE id = $1 AND deleted_at IS NULL', [body.service_id]);
    if (!service) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Service not found.' } }, { status: 404 });
    if (c.scope.branchIds && !c.scope.branchIds.includes(service.branch_id)) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'You can only record attendance for your branch.' } }, { status: 403 });
    const existing = await queryOne<any>('SELECT id FROM attendance_sessions WHERE service_id = $1 AND session_date = $2', [body.service_id, body.session_date]);
    if (existing) return NextResponse.json({ error: { code: 'CONFLICT', message: 'A session for this service already exists on that date.' } }, { status: 409 });
    const s = await queryOne<any>(
      'INSERT INTO attendance_sessions (org_id, branch_id, service_id, session_date, note, recorded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [c.scope.orgId, service.branch_id, body.service_id, body.session_date, body.note ?? null, c.userId],
    );
    const { audit } = await import('@nazareth/core');
    await audit({ userId: c.userId, orgId: c.orgId, action: 'attendance.session_create', entity: 'attendance_session', entityId: s.id, ip: c.ip });
    return NextResponse.json({ data: s }, { status: 201 });
  })(req);
}
