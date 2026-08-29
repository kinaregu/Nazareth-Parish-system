import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm } from '@/lib/api';
import { reportService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** Report catalog (code/name/group/description/params) for the UI runner. */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'reports.view');
    const data = reportService.REPORTS.map((r) => ({
      code: r.code, name: r.name, group: r.group, description: r.description,
      permission: r.permission, sensitive: Boolean(r.sensitive),
      params: r.params.map((p) => ({ key: p.key, label: p.label, type: p.type })),
    }));
    return NextResponse.json({ data });
  })(req);
}
