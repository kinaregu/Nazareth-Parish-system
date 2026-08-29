/**
 * @nazareth/core — notifications & templated messages.
 *
 * - In-app notification center (notifications table)
 * - Email/SMS via provider abstraction, respecting per-user preferences
 * - Template rendering (message_templates): {{name}}, {{date}}, …
 */
import { query, queryOne, queryCol } from '@nazareth/db';
import { sendMail, sendSms } from './providers';
import type { Audience } from '@nazareth/shared';

export interface NotifyPayload {
  type: string;
  title: string;
  body?: string;
  link?: string;
  /** send email to recipients whose preference allows this category */
  emailCategory?: 'announcements' | 'events' | 'groups';
  emailSubject?: string;
  emailBody?: string;
  smsCategory?: 'events' | 'followup';
  smsBody?: string;
}

const PREF_COLUMN: Record<string, string> = {
  announcements: 'email_announcements',
  events: 'email_events',
  groups: 'email_groups',
};

export async function notifyUsers(userIds: string[], payload: NotifyPayload): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  const base = ids.length;
  await query(
    `INSERT INTO notifications (user_id, type, title, body, link)
     SELECT v.id, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}
       FROM (VALUES ${ids.map((id, i) => `($${i + 1}::uuid)`).join(',')}) AS v(id)`,
    [...ids, payload.type, payload.title, payload.body ?? null, payload.link ?? null],
  );

  if (payload.emailSubject && payload.emailBody && payload.emailCategory) {
    const col = PREF_COLUMN[payload.emailCategory];
    const recipients = await query<any>(
      `SELECT DISTINCT u.id, u.email, u.name
         FROM users u
        LEFT JOIN notification_preferences np ON np.user_id = u.id
        WHERE u.id = ANY($1::uuid[]) AND u.email IS NOT NULL AND u.is_active
          AND COALESCE(np.${col}, true)`,
      ids,
    );
    for (const r of recipients) {
      await sendMail({ to: r.email, subject: payload.emailSubject, body: payload.emailBody });
    }
  }
  if (payload.smsBody && payload.smsCategory) {
    const col = payload.smsCategory === 'events' ? 'sms_events' : 'sms_followup';
    const recipients = await query<any>(
      `SELECT DISTINCT u.id, u.phone
         FROM users u
        LEFT JOIN notification_preferences np ON np.user_id = u.id
        WHERE u.id = ANY($1::uuid[]) AND u.phone IS NOT NULL AND u.is_active AND np.${col} = true`,
      ids,
    );
    for (const r of recipients) {
      await sendSms({ to: r.phone, body: payload.smsBody });
    }
  }
  return ids.length;
}

/** Resolve an announcement-style audience to user ids. */
export async function resolveAudienceUserIds(audience: Audience, orgId: string, branchId: string | null): Promise<string[]> {
  switch (audience.type) {
    case 'all':
      return (await queryCol<string>('SELECT id FROM users WHERE org_id = $1 AND is_active AND deleted_at IS NULL', [orgId])).map((r) => r);
    case 'branch': {
      const ids = (await queryCol<string>('SELECT id FROM users WHERE org_id = $1 AND branch_id = $2 AND is_active AND deleted_at IS NULL', [orgId, audience.branch_id])).map((r) => r);
      // plus users whose linked member belongs to the branch
      const memberIds = (await queryCol<string>('SELECT id FROM members WHERE branch_id = $1 AND deleted_at IS NULL', [audience.branch_id])).map((r) => r);
      if (memberIds.length) {
        const ph = memberIds.map((_, i) => `$${i + 1}`).join(',');
        const extra = (await queryCol<string>(`SELECT id FROM users WHERE member_id IS NOT NULL AND member_id IN (${ph}) AND is_active`, memberIds)).map((r) => r);
        ids.push(...extra);
      }
      return ids;
    }
    case 'ministry': {
      const rows = await queryCol<string>('SELECT member_id FROM ministry_members WHERE ministry_id = $1 AND is_active', [audience.ministry_id]);
      return usersForMemberIds(rows.filter(Boolean));
    }
    case 'department': {
      const rows = await queryCol<string>('SELECT member_id FROM department_members WHERE department_id = $1 AND is_active', [audience.department_id]);
      return usersForMemberIds(rows.filter(Boolean));
    }
    case 'group': {
      const rows = await queryCol<string>('SELECT member_id FROM group_members WHERE group_id = $1 AND is_active', [audience.group_id]);
      return usersForMemberIds(rows.filter(Boolean));
    }
    case 'members':
      return usersForMemberIds(audience.member_ids);
    case 'role': {
      const rows = await queryCol<string>(
        `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id
          WHERE r.org_id = $1 AND r.code = $2 AND r.deleted_at IS NULL`,
        [orgId, audience.role],
      );
      return rows.map((r) => r);
    }
    default:
      return [];
  }
}

async function usersForMemberIds(memberIds: string[]): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const ph = memberIds.map((_, i) => `$${i + 1}`).join(',');
  return (await queryCol<string>(`SELECT id FROM users WHERE member_id IN (${ph}) AND is_active`, memberIds)).map((r) => r);
}

/* ─────────────────────────── Templates ─────────────────────────── */

export async function renderTemplate(orgId: string, code: string, vars: Record<string, string | number>): Promise<{ subject: string; body: string } | null> {
  const row = await queryOne<any>('SELECT subject, body FROM message_templates WHERE org_id = $1 AND code = $2 AND is_active', [orgId, code]);
  if (!row) return null;
  const render = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return { subject: render(row.subject || ''), body: render(row.body) };
}

export function listTemplates(orgId: string): Promise<any[]> {
  return query('SELECT * FROM message_templates WHERE org_id = $1 ORDER BY code', [orgId]);
}

export function upsertTemplate(orgId: string, row: { code: string; name: string; channel: string; subject: string; body: string; is_active?: boolean }, userId: string): Promise<any[]> {
  return query(
    `INSERT INTO message_templates (org_id, code, name, channel, subject, body, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (org_id, code) DO UPDATE SET name = EXCLUDED.name, channel = EXCLUDED.channel,
       subject = EXCLUDED.subject, body = EXCLUDED.body, is_active = EXCLUDED.is_active, updated_at = now()
     RETURNING *`,
    [orgId, row.code, row.name, row.channel, row.subject, row.body, row.is_active ?? true, userId],
  );
}
