import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm } from '@/lib/api';
import { reportService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/**
 * Export a report as csv | xlsx | pdf.
 * Permission is the report's own permission plus reports.export for xlsx/pdf.
 * Every export is audit-logged inside the service (reports.export).
 */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'reports.export');
    const c = ctx as any;
    const sp = req.nextUrl.searchParams;
    const code = sp.get('code');
    const format = (sp.get('format') ?? 'csv').toLowerCase() as 'csv' | 'xlsx' | 'pdf';
    if (!code) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Missing report code.' } }, { status: 422 });
    if (!['csv', 'xlsx', 'pdf'].includes(format)) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Format must be csv, xlsx or pdf.' } }, { status: 422 });
    const params: Record<string, string> = {};
    ['from', 'to', 'branch_id'].forEach((k) => {
      const v = sp.get(k);
      if (v) params[k] = v;
    });
    const out = await reportService.exportReport(c.scope, code, params, format, c.ip);
    return new NextResponse(new Uint8Array(out.body), {
      headers: {
        'Content-Type': out.mime,
        'Content-Disposition': `attachment; filename="${out.filename}"`,
      },
    });
  })(req);
}
