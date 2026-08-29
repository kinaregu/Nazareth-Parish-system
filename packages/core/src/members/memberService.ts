/**
 * @nazareth/core — member management.
 *
 * All queries are built from AccessScope (IDOR-safe):
 *  - branch-scoped staff see their branch
 *  - ministry/group leaders see only members of their ministries/groups
 *  - members see only themselves
 * Sensitive fields (notes, emergency contacts) require members.view_sensitive.
 */
import { query, queryOne, tx, type Tx } from '@nazareth/db';
import { ApiError } from '../errors';
import { memberScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';

export interface MemberFilters {
  search?: string;
  status?: string;
  branch_id?: string;
  ministry_id?: string;
  department_id?: string;
  group_id?: string;
  gender?: string;
  age_min?: number;
  age_max?: number;
  baptism_status?: string;
  date_joined_from?: string;
  date_joined_to?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const SORTABLE: Record<string, string> = {
  name: 'm.last_name, m.first_name',
  first_name: 'm.first_name',
  last_name: 'm.last_name',
  member_no: 'm.member_no',
  date_joined: 'm.date_joined',
  date_of_birth: 'm.date_of_birth',
  status: 'm.status',
  phone: 'm.phone',
  email: 'm.email',
};

export async function listMembers(scope: AccessScope, f: MemberFilters) {
  const [sw0, sp0] = memberScopeWhere(scope);
  const where: string[] = ['m.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (f.search) {
    const q = `%${f.search}%`;
    params.push(q, q, q, q, q, q);
    where.push(`(m.last_name ILIKE $${params.length - 5} OR m.first_name ILIKE $${params.length - 4} OR m.preferred_name ILIKE $${params.length - 3} OR m.member_no ILIKE $${params.length - 2} OR m.phone ILIKE $${params.length - 1} OR m.email ILIKE $${params.length})`);
  }
  if (f.status) { where.push(`m.status = $${params.push(f.status)}`); }
  if (f.branch_id) { where.push(`m.branch_id = $${params.push(f.branch_id)}`); }
  if (f.ministry_id) { where.push(`EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.member_id = m.id AND mm.ministry_id = $${params.push(f.ministry_id)})`); }
  if (f.department_id) { where.push(`EXISTS (SELECT 1 FROM department_members dm WHERE dm.member_id = m.id AND dm.department_id = $${params.push(f.department_id)})`); }
  if (f.group_id) { where.push(`EXISTS (SELECT 1 FROM group_members gm WHERE gm.member_id = m.id AND gm.group_id = $${params.push(f.group_id)})`); }
  if (f.gender) { where.push(`m.gender = $${params.push(f.gender)}`); }
  if (f.age_min !== undefined) { where.push(`EXTRACT(YEAR FROM AGE(m.date_of_birth)) >= $${params.push(f.age_min)}`); }
  if (f.age_max !== undefined) { where.push(`EXTRACT(YEAR FROM AGE(m.date_of_birth)) <= $${params.push(f.age_max)}`); }
  if (f.baptism_status) { where.push(`m.baptism_status = $${params.push(f.baptism_status)}`); }
  if (f.date_joined_from) { where.push(`m.date_joined >= $${params.push(f.date_joined_from)}`); }
  if (f.date_joined_to) { where.push(`m.date_joined <= $${params.push(f.date_joined_to)}`); }

  const sw = sw0;
  const sp = sp0;
  // Filter conditions reference $1..$params.length, so the scope fragment
  // (shifted by params.length) binds after the filter params.
  const allParams = [...params, ...sp];
  const fullWhere = `WHERE ${where.join(' AND ')}${sw.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + params.length}`)}`;

  const sortCol = SORTABLE[f.sort || 'name'] || 'm.last_name, m.first_name';
  const order = f.order === 'desc' ? 'DESC' : 'ASC';
  const offset = (f.page - 1) * f.pageSize;

  const totalRow = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM members m ${fullWhere}`, allParams);
  const rows = await query<any>(
    `SELECT m.id, m.member_no, m.branch_id, m.first_name, m.middle_name, m.last_name, m.preferred_name,
            m.gender, m.date_of_birth, m.phone, m.email, m.status, m.member_type, m.date_joined,
            m.baptism_status, m.volunteer, m.is_demo
       FROM members m ${fullWhere}
      ORDER BY ${sortCol} ${order}
      LIMIT ${f.pageSize} OFFSET ${offset}`,
    allParams,
  );
  return {
    data: rows,
    meta: { page: f.page, pageSize: f.pageSize, total: totalRow.c, totalPages: Math.max(1, Math.ceil(totalRow.c / f.pageSize)) },
  };
}

function sanitize(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === '' || v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

export async function getMember(scope: AccessScope, id: string, opts?: { sensitive?: boolean }) {
  // The member id occupies $1, so the scope fragment's placeholders (emitted
  // as $1..$n) must be shifted by one to line up with [id, ...sp].
  const [sw0, sp] = memberScopeWhere(scope);
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const showSensitive = hasPermission(scope, 'members.view_sensitive');
  const row = await queryOne<any>(
    `SELECT m.*, b.name AS branch_name
       FROM members m JOIN branches b ON b.id = m.branch_id
      WHERE m.id = $1 AND m.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!row) throw ApiError.notFound('Member not found.');
  if (!showSensitive && !opts?.sensitive) {
    // Redact sensitive fields for users without members.view_sensitive
    const { notes, emergency_contact_name, emergency_contact_phone, address, city } = row;
    return { ...row, notes: null, emergency_contact_name: null, emergency_contact_phone: null, address: null, city: null };
  }
  return row;
}

export async function createMember(scope: AccessScope, input: Record<string, unknown>, ip?: string) {
  if (!hasPermission(scope, 'members.create')) throw ApiError.forbidden();
  const data = sanitize(input);
  const branchId = data.branch_id as string;
  // Branch authorization: scoped users may only create in their branch(es).
  if (scope.branchIds && !scope.branchIds.includes(branchId)) throw ApiError.forbidden('You can only create members in your branch.');

  const memberNo = await nextMemberNo(scope.orgId);
  const created = await tx(async (t) => {
    const rows = await t.query(
      `INSERT INTO members (org_id, branch_id, member_no, first_name, middle_name, last_name, preferred_name,
         gender, date_of_birth, phone, email, address, city, country,
         emergency_contact_name, emergency_contact_phone, status, member_type, date_joined, first_attendance,
         baptism_status, baptism_date, confirmation_status, confirmation_date, previous_church,
         skills, interests, volunteer, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
       RETURNING *`,
      [
        scope.orgId, branchId, memberNo,
        data.first_name, data.middle_name ?? null, data.last_name, data.preferred_name ?? null,
        data.gender ?? null, (data.date_of_birth as string) || null, data.phone ?? null, data.email ?? null,
        data.address ?? null, data.city ?? null, data.country ?? null,
        data.emergency_contact_name ?? null, data.emergency_contact_phone ?? null,
        data.status || 'active', data.member_type || 'regular',
        (data.date_joined as string) || new Date().toISOString().slice(0, 10),
        (data.first_attendance as string) || null,
        data.baptism_status || 'none', (data.baptism_date as string) || null,
        data.confirmation_status || 'none', (data.confirmation_date as string) || null,
        data.previous_church ?? null,
        JSON.stringify(data.skills ?? []), JSON.stringify(data.interests ?? []),
        Boolean(data.volunteer), data.notes ?? null, scope.userId,
      ],
    );
    const member = rows[0];
    await t.query('INSERT INTO member_status_changes (member_id, to_status, changed_by) VALUES ($1,$2,$3)', [member.id, member.status, scope.userId]);
    return member;
  });
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'member.create', entity: 'member', entityId: created.id, branchId, ip, metadata: { name: `${created.first_name} ${created.last_name}`, member_no: created.member_no } });
  return created;
}

export async function updateMember(scope: AccessScope, id: string, input: Record<string, unknown>, ip?: string) {
  if (!hasPermission(scope, 'members.edit')) throw ApiError.forbidden();
  const existing = await getMember(scope, id, { sensitive: true });
  const data = sanitize(input);
  const newBranch = typeof data.branch_id === 'string' ? data.branch_id : '';
  if (newBranch && newBranch !== existing.branch_id && scope.branchIds && !scope.branchIds.includes(newBranch)) {
    throw ApiError.forbidden('You can only edit members in your branch.');
  }
  const fields: string[] = [];
  const params: unknown[] = [];
  const allowed = [
    'branch_id','first_name','middle_name','last_name','preferred_name','gender','date_of_birth','phone','email',
    'address','city','country','emergency_contact_name','emergency_contact_phone','member_type',
    'date_joined','first_attendance','baptism_status','baptism_date','confirmation_status','confirmation_date',
    'previous_church','volunteer','notes',
  ] as const;
  for (const f of allowed) {
    if (f in data) {
      params.push(data[f] ?? null);
      fields.push(`${f} = $${params.length}`);
    }
  }
  if ('skills' in data) { params.push(JSON.stringify(data.skills ?? [])); fields.push(`skills = $${params.length}`); }
  if ('interests' in data) { params.push(JSON.stringify(data.interests ?? [])); fields.push(`interests = $${params.length}`); }
  if ('status' in data && data.status !== existing.status) {
    const changed = await changeMemberStatus(scope, id, data.status as string, 'edited via profile');
    return changed;
  }
  if (fields.length === 0) return existing;
  const updated = await queryOne<any>(
    `UPDATE members SET ${fields.join(', ')} WHERE id = $${params.push(id)} RETURNING *`,
    params,
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'member.update', entity: 'member', entityId: id, branchId: existing.branch_id, ip, metadata: { fields: Object.keys(data) } });
  return updated;
}

export async function changeMemberStatus(scope: AccessScope, id: string, status: string, reason?: string, ip?: string) {
  if (!hasPermission(scope, 'members.manage_status')) throw ApiError.forbidden();
  const existing = await getMember(scope, id, { sensitive: true });
  const def = await queryOne<any>('SELECT id FROM member_status_defs WHERE org_id = $1 AND code = $2 AND is_active', [scope.orgId, status]);
  if (!def) throw ApiError.validation(`Unknown membership status: ${status}`);
  const updated = await queryOne<any>('UPDATE members SET status = $2 WHERE id = $1 RETURNING *', [id, status]);
  await query('INSERT INTO member_status_changes (member_id, from_status, to_status, reason, changed_by) VALUES ($1,$2,$3,$4,$5)',
    [id, existing.status, status, reason ?? null, scope.userId]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'member.status_change', entity: 'member', entityId: id, branchId: existing.branch_id, ip, metadata: { from: existing.status, to: status, reason } });
  return updated;
}

/** Soft delete (archive). Financial/attendance/pastoral history is preserved via ON DELETE SET NULL / cascade rules. */
export async function archiveMember(scope: AccessScope, id: string, ip?: string) {
  if (!hasPermission(scope, 'members.delete')) throw ApiError.forbidden();
  const existing = await getMember(scope, id, { sensitive: true });
  await query('UPDATE members SET deleted_at = now(), status = CASE WHEN status = \'archived\' THEN status ELSE status END WHERE id = $1', [id]);
  await query('INSERT INTO member_status_changes (member_id, from_status, to_status, reason, changed_by) VALUES ($1,$2,\'archived\',\'archived\',$3)', [id, existing.status, scope.userId]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'member.delete', entity: 'member', entityId: id, branchId: existing.branch_id, ip, metadata: { soft: true } });
  return { id };
}

export async function nextMemberNo(orgId: string): Promise<string> {
  const row = await queryOne<any>('SELECT COALESCE(MAX(CAST(SPLIT_PART(member_no, \'-\', 2) AS INT)), 0) + 1 AS next FROM members WHERE org_id = $1', [orgId]);
  return `NPH-${String(row.next).padStart(4, '0')}`;
}

/* ─────────────────────────── Family / involvement / timeline ─────────────────────────── */

export async function getMemberFamily(scope: AccessScope, memberId: string) {
  const [families, relationships] = await Promise.all([
    query<any>(`SELECT f.id, f.name, f.address, f.city, f.phone, f.primary_contact_id,
                 fm.role AS member_role
                  FROM families f JOIN family_members fm ON fm.family_id = f.id
                 WHERE fm.member_id = $1 AND f.deleted_at IS NULL`, [memberId]),
    query<any>(`SELECT m.id, m.member_no, m.first_name, m.last_name, m.preferred_name, r.type,
                      (SELECT f2.name FROM families f2 JOIN family_members fm2 ON fm2.family_id = f2.id WHERE fm2.member_id = m.id LIMIT 1) AS family_name
                 FROM member_relationships r JOIN members m ON m.id = r.related_id
                 WHERE r.member_id = $1 AND m.deleted_at IS NULL`, [memberId]),
  ]);
  const household = await query<any>(
    `SELECT m.id, m.member_no, m.first_name, m.last_name, m.preferred_name, fm.role
       FROM families f JOIN family_members fm ON fm.family_id = f.id JOIN members m ON m.id = fm.member_id
      WHERE f.id IN (SELECT family_id FROM family_members WHERE member_id = $1)
        AND m.deleted_at IS NULL ORDER BY m.last_name, m.first_name`,
    [memberId],
  );
  return { families, relationships, household };
}

export async function getMemberInvolvement(scope: AccessScope, memberId: string) {
  const [ministries, departments, groups] = await Promise.all([
    query<any>(`SELECT m.id, m.name, m.meeting_day, m.meeting_time, m.location, mm.role
                  FROM ministries m JOIN ministry_members mm ON mm.ministry_id = m.id
                 WHERE mm.member_id = $1 AND m.deleted_at IS NULL AND mm.is_active`, [memberId]),
    query<any>(`SELECT d.id, d.name, d.description, dm.role
                  FROM departments d JOIN department_members dm ON dm.department_id = d.id
                 WHERE dm.member_id = $1 AND d.deleted_at IS NULL AND dm.is_active`, [memberId]),
    query<any>(`SELECT g.id, g.name, g.type, g.meeting_day, g.meeting_time, g.location, gm.role
                  FROM groups g JOIN group_members gm ON gm.group_id = g.id
                 WHERE gm.member_id = $1 AND g.deleted_at IS NULL AND gm.is_active`, [memberId]),
  ]);
  return { ministries, departments, groups };
}

export async function getMemberTimeline(scope: AccessScope, memberId: string) {
  const canViewGiving = hasPermission(scope, 'giving.view');
  const canViewPastoral = hasPermission(scope, 'pastoral.view');
  const items: any[] = [];
  const push = (type: string, at: string | null, title: string, detail?: string) => {
    if (at) items.push({ type, at, title, detail: detail ?? null });
  };

  const member = await queryOne<any>('SELECT * FROM members WHERE id = $1 AND deleted_at IS NULL', [memberId]);
  if (!member) throw ApiError.notFound();

  if (member.date_joined) push('registration', member.date_joined, 'Joined the church', member.date_joined);
  if (member.baptism_date) push('baptism', member.baptism_date, 'Baptism');
  if (member.confirmation_date) push('confirmation', member.confirmation_date, 'Confirmation');
  if (member.first_attendance) push('first_attendance', member.first_attendance, 'First attendance');

  const statusChanges = await query<any>('SELECT from_status, to_status, reason, created_at FROM member_status_changes WHERE member_id = $1 ORDER BY created_at DESC LIMIT 20', [memberId]);
  statusChanges.forEach((s) => push('status', s.created_at, `Status: ${s.from_status || '—'} → ${s.to_status}`, s.reason ?? undefined));

  const [minRows, grpRows] = await Promise.all([
    query<any>('SELECT m.name, mm.joined_at, mm.role FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id WHERE mm.member_id = $1 AND mm.is_active', [memberId]),
    query<any>('SELECT g.name, gm.joined_at, gm.role FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.member_id = $1 AND gm.is_active', [memberId]),
  ]);
  minRows.forEach((r) => push('ministry', r.joined_at, `Joined ministry: ${r.name}`, r.role));
  grpRows.forEach((r) => push('group', r.joined_at, `Joined group: ${r.name}`, r.role));

  const fu = await query<any>(
    `SELECT reason, status, created_at, completed_at, outcome FROM followups WHERE member_id = $1 ORDER BY created_at DESC LIMIT 10`, [memberId],
  );
  fu.forEach((r) => push('followup', r.created_at, `Follow-up: ${r.reason}`, r.outcome ?? undefined));

  const events = await query<any>(
    `SELECT e.title, e.starts_at, er.status FROM event_registrations er JOIN events e ON e.id = er.event_id
      WHERE er.member_id = $1 AND e.deleted_at IS NULL ORDER BY e.starts_at DESC LIMIT 10`, [memberId],
  );
  events.forEach((r) => push('event', r.starts_at, `Event: ${r.title}`, r.status));

  if (canViewGiving) {
    const giving = await query<any>(
      `SELECT g.amount, g.fund_id, gf.name AS fund_name, g.tx_date FROM giving_transactions g
         JOIN giving_funds gf ON gf.id = g.fund_id
        WHERE g.member_id = $1 AND g.status <> 'reversed' ORDER BY g.tx_date DESC LIMIT 5`, [memberId],
    );
    giving.forEach((r) => push('giving', r.tx_date, `Giving: ${r.amount} → ${r.fund_name}`));
  }
  if (canViewPastoral) {
    const pc = await query<any>('SELECT title, type, status, opened_at FROM pastoral_cases WHERE member_id = $1 AND deleted_at IS NULL ORDER BY opened_at DESC LIMIT 5', [memberId]);
    pc.forEach((r) => push('pastoral', r.opened_at, `Pastoral case: ${r.title}`, r.status));
  }

  const att = await query<any>(
    `SELECT s.session_date, sv.name AS service_name, ar.status
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       JOIN services sv ON sv.id = s.service_id
      WHERE ar.member_id = $1 AND ar.status = 'present'
      ORDER BY s.session_date DESC LIMIT 10`, [memberId],
  );
  att.forEach((r) => push('attendance', r.session_date, `Attended: ${r.service_name}`));

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { items: items.slice(0, 60), canViewGiving, canViewPastoral };
}

/* ─────────────────────────── Duplicates ─────────────────────────── */

export interface DuplicateCandidate {
  id: string;
  member_no: string;
  name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  matched_on: string[];
}

export async function findDuplicates(scope: AccessScope, input: { first_name: string; last_name: string; phone?: string; email?: string; date_of_birth?: string }): Promise<DuplicateCandidate[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  params.push(input.first_name.trim().toLowerCase(), input.last_name.trim().toLowerCase());
  conds.push(`(lower(m.first_name) = $1 OR lower(m.last_name) = $2)`);
  if (input.phone) { params.push(input.phone.replace(/\D/g, '')); conds.push(`replace(m.phone, E' ', E'') ILIKE '%' || $${params.length} || '%'`); }
  if (input.email) { params.push(input.email.toLowerCase()); conds.push(`lower(m.email) = $${params.length}`); }
  if (input.date_of_birth) { params.push(input.date_of_birth); conds.push(`m.date_of_birth = $${params.length}`); }
  const [sw, sp] = memberScopeWhere(scope);
  const rows = await query<any>(
    `SELECT m.id, m.member_no, m.first_name, m.middle_name, m.last_name, m.phone, m.email, m.date_of_birth, m.branch_id
       FROM members m
      WHERE m.deleted_at IS NULL${sw.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + params.length}`)}
        AND (${conds.join(' OR ')})
      LIMIT 20`,
    [...params, ...sp],
  );
  return rows.map((r) => ({
    id: r.id,
    member_no: r.member_no,
    name: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' '),
    phone: r.phone,
    email: r.email,
    date_of_birth: r.date_of_birth,
    matched_on: [
      ...(input.phone && r.phone?.replace(/\D/g, '').includes(input.phone.replace(/\D/g, '')) ? ['phone'] : []),
      ...(input.email && r.email?.toLowerCase() === input.email.toLowerCase() ? ['email'] : []),
      ...(input.date_of_birth && r.date_of_birth === input.date_of_birth ? ['dob'] : []),
      'name',
    ],
  }));
}

/* ─────────────────────────── Member stats (dashboard) ─────────────────────────── */

export async function memberStats(scope: AccessScope) {
  const [sw, sp] = memberScopeWhere(scope);
  const p = (sql: string) => queryOne<any>(sql, sp);
  const rows = (sql: string) => query<any>(sql, sp);
  const base = `FROM members m WHERE m.deleted_at IS NULL${sw}`;
  const [total, active, newThisMonth, byStatus] = await Promise.all([
    p(`SELECT COUNT(*)::int AS c ${base}`),
    p(`SELECT COUNT(*)::int AS c ${base} AND m.status = 'active'`),
    p(`SELECT COUNT(*)::int AS c ${base} AND m.date_joined >= date_trunc('month', current_date)`),
    rows(`SELECT m.status, COUNT(*)::int AS c ${base} GROUP BY m.status`),
  ]);
  return {
    total: total.c,
    active: active.c,
    newThisMonth: newThisMonth.c,
    byStatus,
  };
}
