import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, q } from '@/lib/api';
import { memberService, reportService, audit } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** CSV export of the currently filtered member list (audit-logged). */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'members.export');
    const p = q(req.nextUrl.searchParams);
    const res = await memberService.listMembers(c.scope, {
      search: p.search, status: p.status, branch_id: p.branch_id, gender: p.gender as any,
      sort: p.sort, order: (p.order as any) ?? 'asc', page: 1, pageSize: 10000,
    });
    const columns = ['Member #', 'First name', 'Last name', 'Gender', 'Date of birth', 'Phone', 'Email', 'Status', 'Branch', 'Date joined'];
    const rows = res.data.map((m: any) => [m.member_no, m.first_name, m.last_name, m.gender ?? '', m.date_of_birth ?? '', m.phone ?? '', m.email ?? '', m.status, m.branch_id, m.date_joined ?? '']);
    const csv = reportService.toCsv(columns, rows);
    await audit({ userId: c.userId, orgId: c.orgId, action: 'members.export', entity: 'member', ip: c.ip, metadata: { count: rows.length, sensitive: true } });
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="members_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  })(req);
}
