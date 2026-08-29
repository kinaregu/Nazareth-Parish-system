import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm } from '@/lib/api';
import { reportService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** Run a report: /api/v1/reports?code=membership_summary&from=…&to=… */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'reports.view');
    const c = ctx as any;
    const sp = req.nextUrl.searchParams;
    const code = sp.get('code');
    if (!code) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Missing report code.' } }, { status: 422 });
    const params: Record<string, string> = {};
    ['from', 'to', 'branch_id', 'fund_id', 'service_id'].forEach((k) => {
      const v = sp.get(k);
      if (v) params[k] = v;
    });
    const result = await reportService.runReport(c.scope, code, params);
    return NextResponse.json({ data: result });
  })(req);
}
