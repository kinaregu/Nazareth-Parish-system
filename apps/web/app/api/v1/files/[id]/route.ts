import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth } from '@/lib/api';
import { fileService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** Authenticated, scope-checked download (audited). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const out = await fileService.downloadFile(c.scope, params.id, c.ip);
    return new NextResponse(new Uint8Array(out.buffer), {
      headers: {
        'Content-Type': out.mime,
        'Content-Disposition': `attachment; filename="${out.name}"`,
      },
    });
  })(req);
}

/** Delete a file (files.manage or the uploader; scoped). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const res = await fileService.deleteFile(c.scope, params.id, c.ip);
    return NextResponse.json({ data: res });
  })(req);
}
