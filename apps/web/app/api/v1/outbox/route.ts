import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm } from '@/lib/api';
import { query } from '@nazareth/db';

export const dynamic = 'force-dynamic';

/**
 * Dev outbox — when no SMTP provider is configured, outgoing email is stored
 * in `dev_outbox` so admins can view password-reset links etc.
 * Read access: super-admin only.
 */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'backups.manage');
    const data = await query<any>(
      `SELECT id, to_address, subject, body, created_at FROM dev_outbox ORDER BY created_at DESC LIMIT 100`,
    );
    return NextResponse.json({ data });
  })(req);
}
