/**
 * @nazareth/core — events, registrations and the church calendar.
 *
 * Event workflow: draft → published → (registrations) → completed / cancelled.
 * Visibility: public | members | ministry | group — enforced on read AND on
 * registration (backend only).
 */
import { query, queryOne, tx, queryCol } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { notifyUsers } from '../notify/notifyService';
import { config } from '../config';

export function canSeeEvent(scope: AccessScope, e: any): boolean {
  if (scope.isSuper) return true;
  if (e.status !== 'published' && e.status !== 'draft') {
    // non-public statuses require management rights
  }
  switch (e.visibility) {
    case 'public': return true;
    case 'members': return hasPermission(scope, 'events.view') || e.status === 'completed';
    case 'ministry':
      if (e.ministry_id && scope.ministryIds.includes(e.ministry_id)) return true;
      return hasPermission(scope, 'events.manage') && (scope.isSuper || scope.branchIds === null || scope.branchIds.includes(e.branch_id));
    case 'group':
      if (e.group_id && scope.groupIds.includes(e.group_id)) return true;
      return hasPermission(scope, 'events.manage') && (scope.isSuper || scope.branchIds === null || scope.branchIds.includes(e.branch_id));
    default: return hasPermission(scope, 'events.view');
  }
}

export async function listEvents(scope: AccessScope, opts: {
  from?: string; to?: string; status?: string; ministry_id?: string; group_id?: string; page: number; pageSize: number;
}) {
  const [sw, sp] = branchScopeWhere(scope, 'e.branch_id');
  const where = ['e.deleted_at IS NULL'];
  const params: unknown[] = [...sp];
  // Hide drafts/completed from users without management rights
  if (!hasPermission(scope, 'events.manage') && !scope.isSuper) where.push(`e.status IN ('published','completed','cancelled')`);
  if (opts.from) { params.push(opts.from); where.push(`e.starts_at >= $${params.length}::timestamptz`); }
  if (opts.to) { params.push(opts.to); where.push(`e.starts_at <= $${params.length}::timestamptz`); }
  if (opts.status) { params.push(opts.status); where.push(`e.status = $${params.length}`); }
  if (opts.ministry_id) { params.push(opts.ministry_id); where.push(`e.ministry_id = $${params.length}`); }
  if (opts.group_id) { params.push(opts.group_id); where.push(`e.group_id = $${params.length}`); }
  const fullWhere = `WHERE ${where.join(' AND ')}${sw}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM events e ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const rows = await query<any>(
    `SELECT e.*, b.name AS branch_name, mn.name AS ministry_name, g.name AS group_name,
            u.name AS organizer_name,
            (SELECT COUNT(*)::int FROM event_registrations er WHERE er.event_id = e.id AND er.status <> 'cancelled') AS registered_count
       FROM events e
       JOIN branches b ON b.id = e.branch_id
       LEFT JOIN ministries mn ON mn.id = e.ministry_id
       LEFT JOIN groups g ON g.id = e.group_id
       LEFT JOIN users u ON u.id = e.organizer_id
      ${fullWhere}
      ORDER BY e.starts_at DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  const data = rows.filter((e) => canSeeEvent(scope, e));
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function getEvent(scope: AccessScope, id: string) {
  const [sw0, sp] = branchScopeWhere(scope, 'e.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const e = await queryOne<any>(
    `SELECT e.*, b.name AS branch_name, mn.name AS ministry_name, g.name AS group_name,
            u.name AS organizer_name
       FROM events e JOIN branches b ON b.id = e.branch_id
       LEFT JOIN ministries mn ON mn.id = e.ministry_id
       LEFT JOIN groups g ON g.id = e.group_id
       LEFT JOIN users u ON u.id = e.organizer_id
      WHERE e.id = $1 AND e.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!e) throw ApiError.notFound('Event not found.');
  if (!canSeeEvent(scope, e)) throw ApiError.notFound('Event not found.');
  const regs = await query<any>(
    `SELECT er.id, er.status, er.note, er.created_at,
            mem.id AS member_pk, mem.member_no, mem.first_name, mem.last_name,
            mem.preferred_name, u.name AS user_name
       FROM event_registrations er
       LEFT JOIN members mem ON mem.id = er.member_id
       LEFT JOIN users u ON u.id = er.user_id
      WHERE er.event_id = $1 ORDER BY er.created_at DESC`,
    [id],
  );
  return { event: e, registrations: regs };
}

function canManageEvent(scope: AccessScope, e: any): boolean {
  if (scope.isSuper) return true;
  if (!hasPermission(scope, 'events.manage')) return false;
  if (e.ministry_id && scope.ministryIds.includes(e.ministry_id)) return true;
  if (e.group_id && scope.groupIds.includes(e.group_id)) return true;
  return scope.branchIds === null || scope.branchIds.includes(e.branch_id);
}

export async function createEvent(scope: AccessScope, input: any, ip?: string) {
  if (!hasPermission(scope, 'events.manage') && !scope.isSuper) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(input.branch_id)) throw ApiError.forbidden();
  // Leaders may only attach their own ministry; branch staff may attach events in their branch.
  if (input.ministry_id && !scope.isSuper) {
    const ownMinistry = scope.ministryIds.includes(input.ministry_id);
    const ownBranch = scope.branchIds === null || scope.branchIds.includes(input.branch_id);
    if (!ownMinistry && !ownBranch) throw ApiError.forbidden('You can only attach events to your own ministry or branch.');
  }
  const e = await queryOne<any>(
    `INSERT INTO events (org_id, branch_id, title, description, starts_at, ends_at, location, capacity,
       registration_required, registration_deadline, status, visibility, ministry_id, department_id, group_id, organizer_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [scope.orgId, input.branch_id, input.title, input.description ?? null, input.starts_at, input.ends_at || null,
     input.location ?? null, input.capacity ?? null, input.registration_required ?? false,
     input.registration_deadline || null, input.status || 'draft', input.visibility || 'members',
     input.ministry_id ?? null, input.department_id ?? null, input.group_id ?? null, scope.userId],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'event.create', entity: 'event', entityId: e.id, branchId: input.branch_id, ip, metadata: { title: input.title, status: e.status } });
  if (e.status === 'published') {
    await announceEvent(scope, e);
  }
  return e;
}

export async function updateEvent(scope: AccessScope, id: string, input: any, ip?: string) {
  const existing = await getEvent(scope, id);
  if (!canManageEvent(scope, existing.event)) throw ApiError.forbidden();
  const e = await queryOne<any>(
    `UPDATE events SET title=$2, description=$3, starts_at=$4, ends_at=$5, location=$6, capacity=$7,
      registration_required=$8, registration_deadline=$9, status=$10, visibility=$11, ministry_id=$12,
      department_id=$13, group_id=$14
     WHERE id=$1 RETURNING *`,
    [id, input.title ?? existing.event.title, input.description ?? existing.event.description,
     input.starts_at ?? existing.event.starts_at, input.ends_at ?? existing.event.ends_at, input.location ?? existing.event.location,
     input.capacity !== undefined ? input.capacity : existing.event.capacity,
     input.registration_required !== undefined ? input.registration_required : existing.event.registration_required,
     input.registration_deadline ?? existing.event.registration_deadline,
     input.status ?? existing.event.status, input.visibility ?? existing.event.visibility,
     input.ministry_id !== undefined ? (input.ministry_id || null) : existing.event.ministry_id,
     input.department_id !== undefined ? (input.department_id || null) : existing.event.department_id,
     input.group_id !== undefined ? (input.group_id || null) : existing.event.group_id],
  );
  if (input.status === 'published' && existing.event.status !== 'published') await announceEvent(scope, e);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'event.update', entity: 'event', entityId: id, ip, metadata: { status: e.status } });
  return getEvent(scope, id);
}

async function announceEvent(scope: AccessScope, e: any) {
  const dateStr = new Date(e.starts_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  await notifyUsers(
    scope.roleCodes.includes('ministry_leader') || scope.roleCodes.includes('group_leader')
      ? [scope.userId]
      : await (async () => {
          const rows = await queryCol<string>('SELECT id FROM users WHERE org_id = $1 AND is_active AND deleted_at IS NULL', [scope.orgId]);
          return rows;
        })(),
    {
      type: 'event_reminder',
      title: `New event: ${e.title}`,
      body: `${dateStr}${e.location ? ' — ' + e.location : ''}`,
      link: `/events/${e.id}`,
      emailCategory: 'events',
      emailSubject: `Church event: ${e.title}`,
      emailBody: `${e.title}\n${dateStr}\n${e.location ?? ''}\n\n${e.description ?? ''}\n\nOpen ${config.appUrl}/events/${e.id} to register.`,
    },
  ).catch(() => {});
}

export async function archiveEvent(scope: AccessScope, id: string, ip?: string) {
  const existing = await getEvent(scope, id);
  if (!canManageEvent(scope, existing.event)) throw ApiError.forbidden();
  await query('UPDATE events SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'event.delete', entity: 'event', entityId: id, ip, metadata: { soft: true } });
  return { id };
}

/* ─────────────────────────── Registrations ─────────────────────────── */

export async function registerForEvent(scope: AccessScope, input: { event_id: string; status?: string; note?: string }, memberId: string | null, ip?: string) {
  const event = await queryOne<any>('SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL', [input.event_id]);
  if (!event) throw ApiError.notFound('Event not found.');
  if (!canSeeEvent(scope, event)) throw ApiError.notFound('Event not found.');
  if (event.status !== 'published') throw ApiError.conflict('This event is not open for registration.');
  if (!hasPermission(scope, 'events.register') && !scope.isSuper) {
    if (!memberId) throw ApiError.forbidden();
  }
  if (event.registration_required && event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
    throw ApiError.conflict('Registration for this event has closed.');
  }
  if (event.capacity) {
    const count = await queryOne<any>('SELECT COUNT(*)::int AS c FROM event_registrations WHERE event_id = $1 AND status <> \'cancelled\'', [event.id]);
    if (count.c >= event.capacity) throw ApiError.conflict('This event is full.');
  }
  const targetMemberId = memberId;
  if (!targetMemberId) throw ApiError.validation('Your account is not linked to a member profile.');
  const existing = await queryOne<any>('SELECT id, status FROM event_registrations WHERE event_id = $1 AND member_id = $2', [event.id, targetMemberId]);
  let reg;
  if (existing) {
    if (existing.status === 'cancelled') {
      reg = await queryOne<any>('UPDATE event_registrations SET status = $2, note = $3, created_at = now() WHERE id = $1 RETURNING *',
        [existing.id, input.status ?? 'registered', input.note ?? null]);
    } else {
      reg = existing;
    }
  } else {
    reg = await queryOne<any>(
      'INSERT INTO event_registrations (event_id, member_id, user_id, status, note) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [event.id, targetMemberId, scope.userId, input.status ?? 'registered', input.note ?? null],
    );
  }
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'event.register', entity: 'event', entityId: event.id, ip, metadata: { member_id: targetMemberId, status: reg.status } });
  return reg;
}

export async function setRegistrationStatus(scope: AccessScope, eventId: string, regId: string, status: string, ip?: string) {
  const event = await queryOne<any>('SELECT * FROM events WHERE id = $1', [eventId]);
  if (!event) throw ApiError.notFound();
  if (!canManageEvent(scope, event) && !hasPermission(scope, 'events.manage_registrations')) throw ApiError.forbidden();
  const reg = await queryOne<any>('UPDATE event_registrations SET status = $2 WHERE id = $3 AND event_id = $1 RETURNING *', [eventId, status, regId]);
  if (!reg) throw ApiError.notFound('Registration not found.');
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'event.registration_update', entity: 'event', entityId: eventId, ip, metadata: { reg: regId, status } });
  return reg;
}

/* ─────────────────────────── Calendar ─────────────────────────── */

/** Merges events + recurring services + group meetings into calendar items. */
export async function calendar(scope: AccessScope, from: string, to: string) {
  // The events query uses $1/$2 for the date window, so its branch fragment
  // must bind $3; the services query binds $1.
  const [swE, spE] = branchScopeWhere(scope, 'branch_id', 3);
  const [swS, spS] = branchScopeWhere(scope, 's.branch_id', 1);
  const events = await query<any>(
    `SELECT id, title, starts_at, ends_at, location, status, visibility,
            CASE visibility WHEN 'ministry' THEN 'ministry' WHEN 'group' THEN 'group' ELSE 'event' END AS kind
       FROM events
      WHERE deleted_at IS NULL AND starts_at >= $1::timestamptz AND starts_at < ($2::timestamptz + interval '1 day')
        AND (status = 'published' OR ${hasPermission(scope, 'events.manage') ? 'status <> \'cancelled\'' : 'false'})${swE}
      ORDER BY starts_at`,
    [from, to, ...spE],
  );

  const services = await query<any>(
    `SELECT s.id, s.name, s.category, s.day_of_week, s.time, s.location
       FROM services s
      WHERE s.is_active AND s.deleted_at IS NULL${swS}`,
    spS,
  );
  // Materialize recurring services into the window (only those with a day_of_week).
  const items: any[] = [];
  const start = new Date(from);
  const end = new Date(to);
  for (const s of services) {
    if (s.day_of_week === null || s.day_of_week === undefined) continue;
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    while (d <= end) {
      if (d.getDay() === Number(s.day_of_week)) {
        const time = (s.time || '10:00').slice(0, 5);
        const startsAt = `${d.toISOString().slice(0, 10)}T${time}:00`;
        items.push({
          id: `service-${s.id}-${d.toISOString().slice(0, 10)}`,
          title: s.name,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: null,
          location: s.location,
          status: 'published',
          kind: 'service',
        });
      }
      d.setDate(d.getDate() + 1);
    }
  }
  return { items: [...events.map((e) => ({ ...e })), ...items].sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1)) };
}
