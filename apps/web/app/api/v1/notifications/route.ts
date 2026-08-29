import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth, q } from '@/lib/api';
import { query, queryOne } from '@nazareth/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const p = q(req.nextUrl.searchParams);
    const onlyUnread = p.unreadOnly === 'true';
    const where = onlyUnread ? 'read_at IS NULL' : '1=1';
    const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND ${where}`, [c.userId]);
    const data = await query<any>(
      `SELECT * FROM notifications WHERE user_id = $1 AND ${where} ORDER BY created_at DESC LIMIT 50`,
      [c.userId],
    );
    return NextResponse.json({ data, meta: { total: total.c, page: 1, pageSize: 50, totalPages: 1 } });
  })(req);
}

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const body = await req.json().catch(() => ({}));
    if (body.all) {
      await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [c.userId]);
    } else if (typeof body.id === 'string') {
      await query('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL', [body.id, c.userId]);
    }
    return NextResponse.json({ data: { ok: true } });
  })(req);
}
