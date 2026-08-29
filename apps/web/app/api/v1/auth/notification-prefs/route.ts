import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody, requireAuth } from '@/lib/api';
import { query } from '@nazareth/db';
import { notificationPrefsSchema } from '@nazareth/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const row = (await query<any>(
      `SELECT email_announcements, email_events, email_groups, sms_events, sms_followup
         FROM notification_preferences WHERE user_id = $1`, [c.user.id],
    ))[0];
    return NextResponse.json({ data: row ?? { email_announcements: true, email_events: true, email_groups: true, sms_events: false, sms_followup: false } });
  })(req);
}

export async function PUT(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const body = await parseBody(req, notificationPrefsSchema);
    await query(
      `INSERT INTO notification_preferences (user_id, email_announcements, email_events, email_groups, sms_events, sms_followup)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE SET
         email_announcements = EXCLUDED.email_announcements, email_events = EXCLUDED.email_events,
         email_groups = EXCLUDED.email_groups, sms_events = EXCLUDED.sms_events,
         sms_followup = EXCLUDED.sms_followup, updated_at = now()`,
      [c.user.id, body.email_announcements, body.email_events, body.email_groups, body.sms_events, body.sms_followup],
    );
    return NextResponse.json({ data: body });
  })(req);
}
