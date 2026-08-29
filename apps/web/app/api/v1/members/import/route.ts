import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm } from '@/lib/api';
import { importService } from '@nazareth/core';
import { config } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/**
 * POST multipart/form-data: file (CSV), branch_id
 * Returns a preview (validated rows + detected duplicates) — nothing is written.
 */
export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'members.import');
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Upload a CSV file.' } }, { status: 422 });
    const file = form.get('file');
    const branchId = String(form.get('branch_id') ?? '');
    if (!file || typeof file === 'string') return NextResponse.json({ error: { code: 'VALIDATION', message: 'Upload a CSV file.' } }, { status: 422 });
    const max = config.fileMaxSizeMb * 1024 * 1024;
    if (file.size > max) return NextResponse.json({ error: { code: 'VALIDATION', message: `File too large (max ${config.fileMaxSizeMb} MB).` } }, { status: 422 });
    const text = await file.text();
    const preview = await importService.previewImport(c.scope, text, branchId);
    return NextResponse.json({ data: preview });
  })(req);
}
