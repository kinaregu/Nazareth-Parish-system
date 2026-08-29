/**
 * @nazareth/core — ministries, departments and groups.
 * Leaders (role leader/assistant in *_members) get scoped access through
 * AccessScope.ministryIds / groupIds; other staff see branch-wide.
 */
import { query, queryOne, tx } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, ministryScopeWhere, groupScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';

/* ─────────────────────────── Ministries ─────────────────────────── */

export async function listMinistries(scope: AccessScope, opts: { search?: string; page: number; pageSize: number }) {
  const [sw, sp] = ministryScopeWhere(scope, 'm.branch_id', 'm.id');
  const where = 'm.deleted_at IS NULL';
  const params: unknown[] = [...sp];
  if (opts.search) { params.push(`%${opts.search}%`); }
  const searchSql = opts.search ? ` AND (m.name ILIKE $${params.length} OR m.description ILIKE $${params.length})` : '';
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM ministries m WHERE ${where}${searchSql}${sw}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT m.*, b.name AS branch_name,
            (SELECT COUNT(*)::int FROM ministry_members mm WHERE mm.ministry_id = m.id AND mm.is_active) AS member_count,
            (SELECT u.name FROM users u JOIN members mem ON mem.id = u.member_id WHERE mem.id = m.leader_id) AS leader_name,
            (SELECT u.name FROM users u JOIN members mem ON mem.id = u.member_id WHERE mem.id = m.assistant_leader_id) AS assistant_name
       FROM ministries m JOIN branches b ON b.id = m.branch_id
      WHERE ${where}${searchSql}${sw}
      ORDER BY m.name LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function getMinistry(scope: AccessScope, id: string) {
  const [sw0, sp] = ministryScopeWhere(scope, 'm.branch_id', 'm.id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const m = await queryOne<any>(
    `SELECT m.*, b.name AS branch_name,
            (SELECT u.name FROM users u JOIN members mem ON mem.id = u.member_id WHERE mem.id = m.leader_id) AS leader_name,
            (SELECT u.name FROM users u JOIN members mem ON mem.id = u.member_id WHERE mem.id = m.assistant_leader_id) AS assistant_name
       FROM ministries m JOIN branches b ON b.id = m.branch_id
      WHERE m.id = $1 AND m.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!m) throw ApiError.notFound('Ministry not found.');
  const members = await query<any>(
    `SELECT mem.id, mem.member_no, mem.first_name, mem.middle_name, mem.last_name, mem.phone, mem.email, mm.role, mm.joined_at
       FROM ministry_members mm JOIN members mem ON mem.id = mm.member_id
      WHERE mm.ministry_id = $1 AND mm.is_active AND mem.deleted_at IS NULL
      ORDER BY CASE mm.role WHEN 'leader' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END, mem.last_name`,
    [id],
  );
  const events = await query<any>(
    `SELECT e.id, e.title, e.starts_at, e.status, e.location FROM events e
      WHERE e.ministry_id = $1 AND e.deleted_at IS NULL AND e.status IN ('draft','published')
      ORDER BY e.starts_at DESC LIMIT 10`, [id],
  );
  return { ministry: m, members, events };
}

function canManageMinistry(scope: AccessScope, ministryId: string, ministryBranchId: string): boolean {
  if (scope.isSuper) return true;
  if (scope.roleCodes.includes('ministry_leader')) return scope.ministryIds.includes(ministryId);
  return hasPermission(scope, 'ministries.manage') && scope.branchIds?.includes(ministryBranchId) !== false;
}

export async function createMinistry(scope: AccessScope, input: any, ip?: string) {
  if (!hasPermission(scope, 'ministries.manage') && !scope.isSuper) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(input.branch_id)) throw ApiError.forbidden('You can only create ministries in your branch.');
  const m = await queryOne<any>(
    `INSERT INTO ministries (org_id, branch_id, name, description, leader_id, assistant_leader_id, meeting_day, meeting_time, location)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [scope.orgId, input.branch_id, input.name, input.description ?? null, input.leader_id ?? null,
     input.assistant_leader_id ?? null, input.meeting_day ?? null, input.meeting_time ?? null, input.location ?? null],
  );
  if (input.leader_id) await query(`INSERT INTO ministry_members (ministry_id, member_id, role, is_active) VALUES ($1,$2,'leader',true) ON CONFLICT DO NOTHING`, [m.id, input.leader_id]);
  if (input.assistant_leader_id) await query(`INSERT INTO ministry_members (ministry_id, member_id, role, is_active) VALUES ($1,$2,'assistant',true) ON CONFLICT DO NOTHING`, [m.id, input.assistant_leader_id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'ministry.create', entity: 'ministry', entityId: m.id, branchId: input.branch_id, ip, metadata: { name: input.name } });
  return m;
}

export async function updateMinistry(scope: AccessScope, id: string, input: any, ip?: string) {
  const existing = await getMinistry(scope, id);
  if (!canManageMinistry(scope, id, existing.ministry.branch_id)) throw ApiError.forbidden();
  await queryOne<any>(
    `UPDATE ministries SET name=$2, description=$3, leader_id=$4, assistant_leader_id=$5, meeting_day=$6, meeting_time=$7, location=$8, is_active=$9
     WHERE id=$1 RETURNING *`,
    [id, input.name ?? existing.ministry.name, input.description ?? existing.ministry.description,
     input.leader_id !== undefined ? (input.leader_id || null) : existing.ministry.leader_id,
     input.assistant_leader_id !== undefined ? (input.assistant_leader_id || null) : existing.ministry.assistant_leader_id,
     input.meeting_day ?? existing.ministry.meeting_day, input.meeting_time ?? existing.ministry.meeting_time,
     input.location ?? existing.ministry.location, input.is_active ?? existing.ministry.is_active],
  );
  if (input.leader_id) await query(`INSERT INTO ministry_members (ministry_id, member_id, role, is_active) VALUES ($1,$2,'leader',true) ON CONFLICT (ministry_id, member_id) DO UPDATE SET role='leader', is_active=true`, [id, input.leader_id]);
  if (input.assistant_leader_id) await query(`INSERT INTO ministry_members (ministry_id, member_id, role, is_active) VALUES ($1,$2,'assistant',true) ON CONFLICT (ministry_id, member_id) DO UPDATE SET role='assistant', is_active=true`, [id, input.assistant_leader_id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'ministry.update', entity: 'ministry', entityId: id, ip });
  return getMinistry(scope, id);
}

export async function setMinistryMembers(scope: AccessScope, id: string, entries: { member_id: string; role: string; active: boolean }[], ip?: string) {
  const existing = await getMinistry(scope, id);
  if (!canManageMinistry(scope, id, existing.ministry.branch_id)) throw ApiError.forbidden();
  await tx(async (t) => {
    await t.query('DELETE FROM ministry_members WHERE ministry_id = $1', [id]);
    for (const e of entries) {
      await t.query(`INSERT INTO ministry_members (ministry_id, member_id, role, is_active) VALUES ($1,$2,$3,$4)
                      ON CONFLICT (ministry_id, member_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active`,
        [id, e.member_id, e.role, e.active]);
    }
  });
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'ministry.members_update', entity: 'ministry', entityId: id, ip, metadata: { count: entries.length } });
  return getMinistry(scope, id);
}

export async function archiveMinistry(scope: AccessScope, id: string, ip?: string) {
  const existing = await getMinistry(scope, id);
  if (!canManageMinistry(scope, id, existing.ministry.branch_id)) throw ApiError.forbidden();
  await query('UPDATE ministries SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'ministry.delete', entity: 'ministry', entityId: id, ip, metadata: { soft: true } });
  return { id };
}

/* ─────────────────────────── Departments ─────────────────────────── */

export async function listDepartments(scope: AccessScope, opts: { search?: string; page: number; pageSize: number }) {
  const [sw, sp] = branchScopeWhere(scope, 'd.branch_id');
  const params: unknown[] = [...sp];
  const searchSql = opts.search ? ` AND d.name ILIKE $${(params.push(`%${opts.search}%`), params.length)}` : '';
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM departments d WHERE d.deleted_at IS NULL${searchSql}${sw}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT d.*, b.name AS branch_name, mn.name AS ministry_name,
            (SELECT COUNT(*)::int FROM department_members dm WHERE dm.department_id = d.id AND dm.is_active) AS member_count,
            (SELECT u.name FROM users u JOIN members mem ON mem.id = u.member_id WHERE mem.id = d.leader_id) AS leader_name
       FROM departments d JOIN branches b ON b.id = d.branch_id
       LEFT JOIN ministries mn ON mn.id = d.ministry_id
      WHERE d.deleted_at IS NULL${searchSql}${sw}
      ORDER BY d.name LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function getDepartment(scope: AccessScope, id: string) {
  const [sw0, sp] = branchScopeWhere(scope, 'd.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const d = await queryOne<any>(
    `SELECT d.*, b.name AS branch_name, mn.name AS ministry_name,
            (SELECT u.name FROM users u JOIN members mem ON mem.id = u.member_id WHERE mem.id = d.leader_id) AS leader_name
       FROM departments d JOIN branches b ON b.id = d.branch_id LEFT JOIN ministries mn ON mn.id = d.ministry_id
      WHERE d.id = $1 AND d.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!d) throw ApiError.notFound('Department not found.');
  const members = await query<any>(
    `SELECT mem.id, mem.member_no, mem.first_name, mem.last_name, mem.phone, dm.role
       FROM department_members dm JOIN members mem ON mem.id = dm.member_id
      WHERE dm.department_id = $1 AND dm.is_active AND mem.deleted_at IS NULL ORDER BY mem.last_name`, [id],
  );
  return { department: d, members };
}

export async function createDepartment(scope: AccessScope, input: any, ip?: string) {
  if (!hasPermission(scope, 'departments.manage') && !scope.isSuper) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(input.branch_id)) throw ApiError.forbidden();
  const d = await queryOne<any>(
    `INSERT INTO departments (org_id, branch_id, ministry_id, name, description, leader_id, responsibilities)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [scope.orgId, input.branch_id, input.ministry_id ?? null, input.name, input.description ?? null, input.leader_id ?? null, input.responsibilities ?? null],
  );
  if (input.leader_id) await query(`INSERT INTO department_members (department_id, member_id, role) VALUES ($1,$2,'leader') ON CONFLICT DO NOTHING`, [d.id, input.leader_id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'department.create', entity: 'department', entityId: d.id, ip, metadata: { name: input.name } });
  return d;
}

export async function updateDepartment(scope: AccessScope, id: string, input: any, ip?: string) {
  if (!hasPermission(scope, 'departments.manage') && !scope.isSuper) throw ApiError.forbidden();
  const existing = await getDepartment(scope, id);
  await queryOne<any>(
    `UPDATE departments SET ministry_id=$2, name=$3, description=$4, leader_id=$5, responsibilities=$6, is_active=$7 WHERE id=$1 RETURNING *`,
    [id, input.ministry_id ?? existing.department.ministry_id, input.name ?? existing.department.name,
     input.description ?? existing.department.description, input.leader_id !== undefined ? (input.leader_id || null) : existing.department.leader_id,
     input.responsibilities ?? existing.department.responsibilities, input.is_active ?? existing.department.is_active],
  );
  if (input.leader_id) await query(`INSERT INTO department_members (department_id, member_id, role) VALUES ($1,$2,'leader') ON CONFLICT (department_id, member_id) DO UPDATE SET role='leader'`, [id, input.leader_id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'department.update', entity: 'department', entityId: id, ip });
  return getDepartment(scope, id);
}

export async function setDepartmentMembers(scope: AccessScope, id: string, entries: { member_id: string; role: string; active: boolean }[], ip?: string) {
  if (!hasPermission(scope, 'departments.manage') && !scope.isSuper) throw ApiError.forbidden();
  await tx(async (t) => {
    await t.query('DELETE FROM department_members WHERE department_id = $1', [id]);
    for (const e of entries) {
      await t.query(`INSERT INTO department_members (department_id, member_id, role, is_active) VALUES ($1,$2,$3,$4)
                      ON CONFLICT (department_id, member_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active`,
        [id, e.member_id, e.role, e.active]);
    }
  });
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'department.members_update', entity: 'department', entityId: id, ip, metadata: { count: entries.length } });
  return getDepartment(scope, id);
}

export async function archiveDepartment(scope: AccessScope, id: string, ip?: string) {
  if (!hasPermission(scope, 'departments.manage') && !scope.isSuper) throw ApiError.forbidden();
  await query('UPDATE departments SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'department.delete', entity: 'department', entityId: id, ip, metadata: { soft: true } });
  return { id };
}

/* ─────────────────────────── Groups ─────────────────────────── */

export async function listGroups(scope: AccessScope, opts: { search?: string; page: number; pageSize: number }) {
  const [sw, sp] = groupScopeWhere(scope, 'g.branch_id', 'g.id');
  const params: unknown[] = [...sp];
  const searchSql = opts.search ? ` AND g.name ILIKE $${(params.push(`%${opts.search}%`), params.length)}` : '';
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM groups g WHERE g.deleted_at IS NULL${searchSql}${sw}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT g.*, b.name AS branch_name,
            (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id AND gm.is_active) AS member_count,
            (SELECT u.name FROM users u JOIN members mem ON mem.id = u.member_id WHERE mem.id = g.leader_id) AS leader_name
       FROM groups g JOIN branches b ON b.id = g.branch_id
      WHERE g.deleted_at IS NULL${searchSql}${sw}
      ORDER BY g.name LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) } };
}

export async function getGroup(scope: AccessScope, id: string) {
  const [sw0, sp] = groupScopeWhere(scope, 'g.branch_id', 'g.id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const g = await queryOne<any>(
    `SELECT g.*, b.name AS branch_name,
            (SELECT u.name FROM users u JOIN members mem ON mem.id = u.member_id WHERE mem.id = g.leader_id) AS leader_name,
            (SELECT u.name FROM users u JOIN members mem ON mem.id = u.member_id WHERE mem.id = g.assistant_leader_id) AS assistant_name
       FROM groups g JOIN branches b ON b.id = g.branch_id
      WHERE g.id = $1 AND g.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!g) throw ApiError.notFound('Group not found.');
  const members = await query<any>(
    `SELECT mem.id, mem.member_no, mem.first_name, mem.last_name, mem.phone, mem.email, gm.role, gm.joined_at
       FROM group_members gm JOIN members mem ON mem.id = gm.member_id
      WHERE gm.group_id = $1 AND gm.is_active AND mem.deleted_at IS NULL
      ORDER BY CASE gm.role WHEN 'leader' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END, mem.last_name`, [id],
  );
  const events = await query<any>(
    `SELECT e.id, e.title, e.starts_at, e.status FROM events e
      WHERE e.group_id = $1 AND e.deleted_at IS NULL AND e.status IN ('draft','published') ORDER BY e.starts_at DESC LIMIT 10`, [id],
  );
  return { group: g, members, events };
}

function canManageGroup(scope: AccessScope, groupId: string): boolean {
  if (scope.isSuper) return true;
  if (scope.roleCodes.includes('group_leader')) return scope.groupIds.includes(groupId);
  return hasPermission(scope, 'groups.manage');
}

export async function createGroup(scope: AccessScope, input: any, ip?: string) {
  if (!hasPermission(scope, 'groups.manage') && !scope.isSuper) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(input.branch_id)) throw ApiError.forbidden();
  const g = await queryOne<any>(
    `INSERT INTO groups (org_id, branch_id, name, type, description, leader_id, assistant_leader_id, location, meeting_day, meeting_time, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [scope.orgId, input.branch_id, input.name, input.type || 'cell', input.description ?? null, input.leader_id ?? null,
     input.assistant_leader_id ?? null, input.location ?? null, input.meeting_day ?? null, input.meeting_time ?? null, input.is_active ?? true],
  );
  if (input.leader_id) await query(`INSERT INTO group_members (group_id, member_id, role) VALUES ($1,$2,'leader') ON CONFLICT DO NOTHING`, [g.id, input.leader_id]);
  if (input.assistant_leader_id) await query(`INSERT INTO group_members (group_id, member_id, role) VALUES ($1,$2,'assistant') ON CONFLICT DO NOTHING`, [g.id, input.assistant_leader_id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'group.create', entity: 'group', entityId: g.id, ip, metadata: { name: input.name } });
  return g;
}

export async function updateGroup(scope: AccessScope, id: string, input: any, ip?: string) {
  const existing = await getGroup(scope, id);
  if (!canManageGroup(scope, id)) throw ApiError.forbidden();
  await queryOne<any>(
    `UPDATE groups SET name=$2, type=$3, description=$4, leader_id=$5, assistant_leader_id=$6, location=$7, meeting_day=$8, meeting_time=$9, is_active=$10
     WHERE id=$1 RETURNING *`,
    [id, input.name ?? existing.group.name, input.type ?? existing.group.type, input.description ?? existing.group.description,
     input.leader_id !== undefined ? (input.leader_id || null) : existing.group.leader_id,
     input.assistant_leader_id !== undefined ? (input.assistant_leader_id || null) : existing.group.assistant_leader_id,
     input.location ?? existing.group.location, input.meeting_day ?? existing.group.meeting_day,
     input.meeting_time ?? existing.group.meeting_time, input.is_active ?? existing.group.is_active],
  );
  if (input.leader_id) await query(`INSERT INTO group_members (group_id, member_id, role) VALUES ($1,$2,'leader') ON CONFLICT (group_id, member_id) DO UPDATE SET role='leader'`, [id, input.leader_id]);
  if (input.assistant_leader_id) await query(`INSERT INTO group_members (group_id, member_id, role) VALUES ($1,$2,'assistant') ON CONFLICT (group_id, member_id) DO UPDATE SET role='assistant'`, [id, input.assistant_leader_id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'group.update', entity: 'group', entityId: id, ip });
  return getGroup(scope, id);
}

export async function setGroupMembers(scope: AccessScope, id: string, entries: { member_id: string; role: string; active: boolean }[], ip?: string) {
  const existing = await getGroup(scope, id);
  if (!canManageGroup(scope, id)) throw ApiError.forbidden();
  await tx(async (t) => {
    await t.query('DELETE FROM group_members WHERE group_id = $1', [id]);
    for (const e of entries) {
      await t.query(`INSERT INTO group_members (group_id, member_id, role, is_active) VALUES ($1,$2,$3,$4)
                      ON CONFLICT (group_id, member_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active`,
        [id, e.member_id, e.role, e.active]);
    }
  });
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'group.members_update', entity: 'group', entityId: id, ip, metadata: { count: entries.length } });
  return getGroup(scope, id);
}

export async function archiveGroup(scope: AccessScope, id: string, ip?: string) {
  const existing = await getGroup(scope, id);
  if (!canManageGroup(scope, id)) throw ApiError.forbidden();
  await query('UPDATE groups SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'group.delete', entity: 'group', entityId: id, ip, metadata: { soft: true } });
  return { id };
}
