/**
 * @nazareth/core — background job scheduler (in-process, single node).
 *
 *   every 60s:  announcement lifecycle (publish scheduled / expire old)
 *   every 60s:  event reminders (events starting within 24h)
 *   every 6h:   attendance absence detection → follow-ups
 *   daily:      database backup + retention prune
 *
 * Multi-node deployments should replace this with an external scheduler
 * (cron / queue) calling the same service functions (docs/DEPLOYMENT.md).
 */
import { query, queryCol } from '@nazareth/db';
import { runAnnouncementLifecycle } from '../announcements/announcementService';
import { runAbsenceDetection } from '../attendance/attendanceService';
import { runBackup, pruneBackups } from '../backups/backupService';
import { notifyUsers } from '../notify/notifyService';
import { config } from '../config';

let started = false;
const locks: Record<string, boolean> = {};

async function guarded(name: string, fn: () => Promise<void>) {
  if (locks[name]) return;
  locks[name] = true;
  try {
    await fn();
  } catch (err) {
    console.error(`[job:${name}]`, err);
  } finally {
    locks[name] = false;
  }
}

export function startJobs(): void {
  if (started) return;
  started = true;

  setInterval(async () => {
    await guarded('announcements', async () => {
      const r = await runAnnouncementLifecycle();
      if (r.published || r.expired) console.log(`[job:announcements] published=${r.published} expired=${r.expired}`);
    });
    await guarded('event-reminders', async () => {
      const events = await query<any>(
        `SELECT e.* FROM events e
          WHERE e.status = 'published' AND e.deleted_at IS NULL
            AND e.starts_at BETWEEN now() + interval '5 minutes' AND now() + interval '24 hours'
            AND (e.last_reminded_at IS NULL OR e.last_reminded_at < now() - interval '23 hours')`,
      );
      for (const e of events) {
        const userIds = await queryCol<string>(
          `SELECT DISTINCT u.id FROM event_registrations er
             JOIN users u ON u.id = er.user_id
            WHERE er.event_id = $1 AND er.status = 'registered'`,
          [e.id],
        );
        const dateStr = new Date(e.starts_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
        if (userIds.length) {
          await notifyUsers(userIds, {
            type: 'event_reminder', title: `Reminder: ${e.title}`,
            body: `Starting ${dateStr}${e.location ? ' at ' + e.location : ''}`, link: `/events/${e.id}`,
            emailCategory: 'events', emailSubject: `Event reminder: ${e.title}`,
            emailBody: `${e.title}\n${dateStr}${e.location ? '\n' + e.location : ''}`,
          }).catch(() => {});
        }
        await query('UPDATE events SET last_reminded_at = now() WHERE id = $1', [e.id]);
      }
    });
  }, 60_000).unref?.();

  setInterval(() => {
    guarded('absence', async () => {
      const r = await runAbsenceDetection();
      if (r.created) console.log(`[job:absence] follow-ups created=${r.created} skipped=${r.skipped}`);
    });
  }, 6 * 60 * 60_000).unref?.();

  setInterval(async () => {
    const hour = new Date().getHours();
    if (hour !== config.backupHour) return;
    await guarded('backup', async () => {
      await runBackup('scheduled');
      const pruned = await pruneBackups();
      console.log(`[job:backup] backup complete, pruned=${pruned}`);
    });
  }, 60 * 60_000).unref?.();

  console.log('[jobs] scheduler started (announcements, reminders, absence, backup)');
}

export async function runBackupNow(): Promise<unknown> {
  const r = await runBackup('manual');
  await pruneBackups();
  return r;
}
