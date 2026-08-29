import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm } from '@/lib/api';
import { backupService } from '@nazareth/core';

export const dynamic = 'force-dynamic';

/** List backups (backups.manage / super-admin). */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'backups.manage');
    const data = await backupService.listBackups();
    return NextResponse.json({ data });
  })(req);
}

/** Run a manual backup now (audited). */
export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'backups.manage');
    const result = await backupService.runBackup('manual', c.userId);
    return NextResponse.json({ data: result }, { status: 201 });
  })(req);
}
