import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth, requirePerm, parseBody } from '@/lib/api';
import { reportService } from '@nazareth/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** My saved report filters. */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requireAuth(ctx);
    const c = ctx as any;
    const data = await reportService.listSavedFilters(c.scope, c.userId);
    return NextResponse.json({ data });
  })(req);
}

const saveSchema = z.object({
  name: z.string().trim().min(1).max(100),
  report_code: z.string().trim().min(2).max(60),
  params: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const body = await parseBody(req, saveSchema);
    const f = await reportService.saveFilter(c.scope, body as any, c.ip);
    return NextResponse.json({ data: f }, { status: 201 });
  })(req);
}

export async function DELETE(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Missing filter id.' } }, { status: 422 });
    await reportService.deleteSavedFilter(c.scope, id);
    return NextResponse.json({ data: { ok: true } });
  })(req);
}
