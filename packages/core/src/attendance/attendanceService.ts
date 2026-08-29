/**
 * @nazareth/core — attendance: services (recurring schedules), sessions
 * (one occurrence), records (per person, per session) + statistics.
 *
 * Absence detection (run as a job) creates follow-ups when members miss
 * services beyond configurable thresholds.
 */
import { query, queryOne, tx, queryValue } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { notifyUsers } from '../notify/notifyService';
import { config } from '../config';

/* ─────────────────────────── Services (schedules) ─────────────────────────── */

export async function listServices(scope: AccessScope, opts: { includeInactive?: boolean }) {
  const [sw, sp] = branchScopeWhere(scope, 's.branch_id');
  const data = await query<any>(
    `SELECT s.*, b.name AS branch_name,
            (SELECT COUNT(*)::int FROM attendance_sessions a WHERE a.service_id = s.id) AS session_count
       FROM services s JOIN branches b ON b.id = s.branch_id
      WHERE s.deleted_at IS NULL AND ${opts.includeInactive ? 'true' : 's.is_active'}${sw}
      ORDER BY CASE s.category WHEN 'sunday' THEN 0 WHEN 'midweek' THEN 1 ELSE 2 END, s.name`,
    sp,
  );
  return data;
}

export async function createService(scope: AccessScope, input: any, ip?: string) {
  if (!hasPermission(scope, 'attendance.manage') && !scope.isSuper) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(input.branch_id)) throw ApiError.forbidden();
  const s = await queryOne<any>(
    `INSERT INTO services (org_id, branch_id, name, category, day_of_week, time, location, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [scope.orgId, input.branch_id, input.name, input.category, input.day_of_week ?? null, input.time ?? null, input.location ?? null, input.active ?? true],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'service.create', entity: 'service', entityId: s.id, ip, metadata: { name: input.name } });
  return s;
}

export async function updateService(scope: AccessScope, id: string, input: any, ip?: string) {
  if (!hasPermission(scope, 'attendance.manage') && !scope.isSuper) throw ApiError.forbidden();
  const existing = await queryOne<any>('SELECT * FROM services WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) throw ApiError.notFound();
  if (scope.branchIds && !scope.branchIds.includes(existing.branch_id)) throw ApiError.forbidden();
  const s = await queryOne<any>(
    `UPDATE services SET name=$2, category=$3, day_of_week=$4, time=$5, location=$6, is_active=$7 WHERE id=$1 RETURNING *`,
    [id, input.name ?? existing.name, input.category ?? existing.category, input.day_of_week ?? existing.day_of_week,
     input.time ?? existing.time, input.location ?? existing.location, input.active ?? existing.is_active],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'service.update', entity: 'service', entityId: id, ip });
  return s;
}

/* ─────────────────────────── Sessions ─────────────────────────── */

export async function listSessions(scope: AccessScope, opts: { service_id?: string; from?: string; to?: string; page: number; pageSize: number }) {
  const [sw, sp] = branchScopeWhere(scope, 'a.branch_id');
  const where: string[] = [];
  const params: unknown[] = [...sp];
  if (opts.service_id) { params.push(opts.service_id); where.push(`a.service_id = $${params.length}`); }
  if (opts.from) { params.push(opts.from); where.push(`a.session_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`a.session_date <= $${params.length}`); }
  const base = where.length ? where.join(' AND ') : 'true';
  const fullWhere = `WHERE ${base}${sw}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM attendance_sessions a ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT a.*, s.name AS service_name, s.category, b.name AS branch_name,
            (SELECT COUNT(*)::int FROM attendance_records r WHERE r.session_id = a.id) AS present_count,
            (SELECT u.name FROM users u WHERE u.id = a.recorded_by) AS recorded_by_name
       FROM attendance_sessions a
       JOIN services s ON s.id = a.service_id
       JOIN branches b ON b.id = a.branch_id
      ${fullWhere}
      ORDER BY a.session_date DESC, s.name
      LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function getSession(scope: AccessScope, id: string) {
  const [sw0, sp] = branchScopeWhere(scope, 'a.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const s = await queryOne<any>(
    `SELECT a.*, sv.name AS service_name, sv.category, b.name AS branch_name,
            (SELECT u.name FROM users u WHERE u.id = a.recorded_by) AS recorded_by_name
       FROM attendance_sessions a JOIN services sv ON sv.id = a.service_id JOIN branches b ON b.id = a.branch_id
      WHERE a.id = $1${sw}`,
    [id, ...sp],
  );
  if (!s) throw ApiError.notFound('Attendance session not found.');
  const records = await query<any>(
    `SELECT r.id, r.status, r.note,
            m.id AS member_pk, m.member_no, m.first_name, m.middle_name, m.last_name,
            v.id AS visitor_pk, (v.first_name || COALESCE(' ' || v.last_name, '')) AS visitor_name
       FROM attendance_records r
       LEFT JOIN members m ON m.id = r.member_id
       LEFT JOIN visitors v ON v.id = r.visitor_id
      WHERE r.session_id = $1
      ORDER BY CASE r.status WHEN 'present' THEN 0 WHEN 'first_time' THEN 1 ELSE 2 END, m.last_name, visitor_name`,
    [id],
  );
  return { session: s, records };
}

export async function saveAttendance(scope: AccessScope, input: { session_id: string; entries: { member_id?: string; visitor_id?: string; status: string }[] }, ip?: string) {
  if (!hasPermission(scope, 'attendance.manage')) throw ApiError.forbidden();
  const { session_id, entries } = input;
  const session = await queryOne<any>('SELECT * FROM attendance_sessions WHERE id = $1', [session_id]);
  if (!session) throw ApiError.notFound('Attendance session not found.');
  if (scope.branchIds && !scope.branchIds.includes(session.branch_id)) throw ApiError.forbidden();

  await tx(async (t) => {
    for (const e of entries) {
      if (e.member_id) {
        await t.query(
          `INSERT INTO attendance_records (session_id, member_id, status, created_by)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (session_id, member_id) DO UPDATE SET status = EXCLUDED.status, created_at = now()`,
          [session_id, e.member_id, e.status, scope.userId],
        );
      } else if (e.visitor_id) {
        await t.query(
          `INSERT INTO attendance_records (session_id, visitor_id, status, created_by)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (session_id, visitor_id) DO UPDATE SET status = EXCLUDED.status, created_at = now()`,
          [session_id, e.visitor_id, e.status, scope.userId],
        );
      }
    }
    await t.query('UPDATE attendance_sessions SET recorded_by = $2 WHERE id = $1', [session_id, scope.userId]);
  });
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'attendance.save', entity: 'attendance_session', entityId: session_id, branchId: session.branch_id, ip, metadata: { entries: entries.length } });
  return getSession(scope, session_id);
}

/* ─────────────────────────── Statistics ─────────────────────────── */

export async function attendanceTrend(scope: AccessScope, weeks = 12, serviceId?: string) {
  const [sw, sp] = branchScopeWhere(scope, 'a.branch_id');
  const svcFilter = serviceId ? ` AND a.service_id = $${(sp.push(serviceId), sp.length)}` : '';
  const rows = await query<any>(
    `SELECT to_char(date_trunc('week', a.session_date), 'YYYY-MM-DD') AS week,
            COUNT(DISTINCT a.service_id) AS services,
            COUNT(r.id) FILTER (WHERE r.status IN ('present','first_time','visitor')) AS present,
            COUNT(r.id) FILTER (WHERE r.status = 'absent') AS absent
       FROM attendance_sessions a
       LEFT JOIN attendance_records r ON r.session_id = a.id
      WHERE a.session_date >= current_date - make_interval(weeks => ${weeks})${svcFilter}${sw}
      GROUP BY 1 ORDER BY 1`,
    sp,
  );
  return rows;
}

export async function attendanceByService(scope: AccessScope, weeks = 8) {
  const [sw, sp] = branchScopeWhere(scope, 's.branch_id');
  return query<any>(
    `SELECT s.name, s.category,
            COUNT(DISTINCT a.id) AS sessions,
            COUNT(r.id) FILTER (WHERE r.status IN ('present','first_time','visitor'))::float / NULLIF(COUNT(DISTINCT a.id), 0) AS avg_attendance
       FROM services s
       LEFT JOIN attendance_sessions a ON a.service_id = s.id AND a.session_date >= current_date - make_interval(weeks => ${weeks})
       LEFT JOIN attendance_records r ON r.session_id = a.id
      WHERE s.is_active AND ${'true'}${sw}
      GROUP BY s.id, s.name, s.category ORDER BY s.name`,
    sp,
  );
}

export async function memberAttendanceHistory(scope: AccessScope, memberId: string, limit = 50) {
  // The caller must have already established access to this member.
  return query<any>(
    `SELECT s.session_date, sv.name AS service_name, sv.category, r.status
       FROM attendance_records r
       JOIN attendance_sessions s ON s.id = r.session_id
       JOIN services sv ON sv.id = s.service_id
      WHERE r.member_id = $1
      ORDER BY s.session_date DESC LIMIT ${Math.min(limit, 200)}`,
    [memberId],
  );
}

export async function memberAttendanceRate(scope: AccessScope, memberId: string, weeks = 8): Promise<number> {
  // Member id occupies $1; shift the scope fragment to bind after it.
  const [sw0, sp] = branchScopeWhere(scope, 'a.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const row = await queryOne<any>(
    `SELECT COUNT(DISTINCT a.id) FILTER (WHERE r.id IS NOT NULL AND r.status IN ('present','first_time')) AS present,
            COUNT(DISTINCT a.id) AS total
       FROM attendance_sessions a
       JOIN services sv ON sv.id = a.service_id
       LEFT JOIN attendance_records r ON r.session_id = a.id AND r.member_id = $1
      WHERE a.session_date >= current_date - make_interval(weeks => ${weeks})${sw}`,
    [memberId, ...sp],
  );
  if (!row || !row.total) return 0;
  return Math.round((row.present / row.total) * 100);
}

/* ─────────────────────────── Absence detection (job) ─────────────────────────── */

/**
 * For each active member, find their last attendance in each recurring
 * service. If they've been absent beyond the threshold and have no open
 * attendance follow-up yet, create one and notify the assigned leader.
 */
export async function runAbsenceDetection(): Promise<{ created: number; skipped: number }> {
  const { short } = config.absenceWeeks;
  const rows = await query<any>(
    `WITH last_seen AS (
       SELECT m.id AS member_id, m.branch_id, m.first_name, m.last_name, m.email,
              sv.id AS service_id, sv.name AS service_name,
              MAX(s.session_date) AS last_attendance
         FROM members m
         JOIN services sv ON sv.branch_id = m.branch_id AND sv.is_active AND sv.category IN ('sunday','midweek')
         LEFT JOIN attendance_sessions s ON s.service_id = sv.id
         LEFT JOIN attendance_records r ON r.session_id = s.id AND r.member_id = m.id AND r.status IN ('present','first_time')
        WHERE m.deleted_at IS NULL AND m.status = 'active'
        GROUP BY m.id, m.branch_id, m.first_name, m.last_name, m.email, sv.id, sv.name
     )
     SELECT ls.*, m.user_id, u.name AS user_name
       FROM last_seen ls
       JOIN members m ON m.id = ls.member_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE ls.last_attendance IS NOT NULL
        AND ls.last_attendance < current_date - make_interval(weeks => ${short})`,
  );

  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    const open = await queryOne<any>(
      `SELECT id FROM followups
        WHERE member_id = $1 AND source = 'attendance' AND status IN ('pending','in_progress')`,
      [r.member_id],
    );
    if (open) { skipped++; continue; }

    // Assign to a pastor in the member's branch (fallback: any pastor).
    const assignee = await queryOne<any>(
      `SELECT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles rl ON rl.id = ur.role_id
        WHERE rl.code = 'pastor' AND u.is_active
          AND (u.branch_id = $1 OR u.branch_id IS NULL)
        ORDER BY u.branch_id IS NULL DESC LIMIT 1`,
      [r.branch_id],
    );
    if (!assignee) continue;

    const id = await queryValue<string>(
      `INSERT INTO followups (org_id, branch_id, source, subject_type, subject_id, member_id, reason, assigned_to, due_date, priority, status, created_by)
       VALUES ($1,$2,'attendance','member',$3,$3,$4,$5, current_date + 2, 'normal','pending',NULL) RETURNING id`,
      [(await queryOne<any>('SELECT id FROM organizations LIMIT 1'))!.id, r.branch_id, r.member_id,
       `Absent from ${r.service_name} since ${r.last_attendance} (over ${short} weeks)`, assignee.id],
    );
    created++;
    await notifyUsers([assignee.id], {
      type: 'followup_reminder',
      title: 'Attendance follow-up needed',
      body: `${r.first_name} ${r.last_name} has not been seen at ${r.service_name} for over ${short} weeks.`,
      link: '/pastoral/followups',
    });
  }
  return { created, skipped };
}
