import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth } from '@/lib/api';
import { query } from '@nazareth/db';

export const dynamic = 'force-dynamic';

/** The signed-in member's own event registrations (portal). */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const linked = c.scope.linkedMemberId;
    const data = linked
      ? await query<any>(
          `SELECT er.id, er.event_id, er.status, e.title, e.starts_at
             FROM event_registrations er JOIN events e ON e.id = er.event_id
            WHERE er.member_id = $1 AND er.status <> 'cancelled'
            ORDER BY e.starts_at DESC LIMIT 50`,
          [linked],
        )
      : [];
    return NextResponse.json({ data });
  })(req);
}
