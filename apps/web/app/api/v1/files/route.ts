import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth } from '@/lib/api';
import { fileService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/**
 * Upload a file (multipart: file, kind, entity_type, entity_id).
 * Files are stored in a private directory (never served by Next) and accessed
 * through authenticated, scoped downloads.
 */
export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Expected multipart/form-data.' } }, { status: 422 });
    const file = form.get('file');
    if (!file || typeof file === 'string') return NextResponse.json({ error: { code: 'VALIDATION', message: 'No file provided.' } }, { status: 422 });
    const buf = Buffer.from(await file.arrayBuffer());
    const record = await fileService.saveFile(c.scope, {
      buffer: buf,
      mime: file.type || 'application/octet-stream',
      originalName: file.name,
      kind: String(form.get('kind') ?? 'general'),
      entityType: String(form.get('entity_type') ?? '') || undefined,
      entityId: String(form.get('entity_id') ?? '') || undefined,
    });
    return NextResponse.json({ data: record }, { status: 201 });
  })(req);
}

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const sp = req.nextUrl.searchParams;
    const res = await fileService.listFiles(c.scope, {
      kind: sp.get('kind') ?? undefined,
      entityId: sp.get('entity_id') ?? undefined,
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : 50,
    });
    return NextResponse.json({ data: res.data, meta: res.meta });
  })(req);
}
