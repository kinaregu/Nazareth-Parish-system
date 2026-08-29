import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm } from '@/lib/api';
import { query, queryValue } from '@nazareth/db';

export const dynamic = 'force-dynamic';

/** Audit trail — super-admin only (audit.view). */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    if (!c.scope.isSuper && !c.scope.permissions.has('audit.view')) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to view audit logs.' } }, { status: 403 });
    }
    const sp = req.nextUrl.searchParams;
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (sp.get('user_id')) { params.push(sp.get('user_id')); where.push(`a.user_id = $${params.length}`); }
    if (sp.get('action')) { params.push(sp.get('action')!); where.push(`a.action ILIKE $${params.length}`); }
    if (sp.get('entity')) { params.push(sp.get('entity')!); where.push(`a.entity = $${params.length}`); }
    if (sp.get('from')) { params.push(sp.get('from')!); where.push(`a.created_at >= $${params.length}`); }
    if (sp.get('to')) { params.push(sp.get('to')!); where.push(`a.created_at <= $${params.length}`); }
    const page = sp.get('page') ? Number(sp.get('page')) : 1;
    const pageSize = sp.get('pageSize') ? Number(sp.get('pageSize')) : 50;
    const fullWhere = `WHERE ${where.join(' AND ')}`;
    const total = (await queryValue<number>(`SELECT COUNT(*)::int FROM audit_logs a ${fullWhere}`, params)) ?? 0;
    const data = await query<any>(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.metadata, a.ip, a.created_at,
              u.name AS user_name, u.email AS user_email
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        ${fullWhere}
        ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    return NextResponse.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
  })(req);
}
