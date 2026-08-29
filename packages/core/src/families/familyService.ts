/**
 * @nazareth/core — family/household management.
 * A family is a household; membership is via family_members (no duplicated
 * address/contact per member — the member keeps their own contact fields,
 * the family keeps the shared household address).
 */
import { query, queryOne, tx } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';

export async function listFamilies(scope: AccessScope, opts: { search?: string; page: number; pageSize: number }) {
  const [sw, sp] = branchScopeWhere(scope, 'f.branch_id');
  const where = 'WHERE f.deleted_at IS NULL';
  const params: unknown[] = [...sp];
  if (opts.search) {
    params.push(`%${opts.search}%`);
    params.push(`%${opts.search}%`);
    const whereExtra = `(f.name ILIKE $${params.length - 1} OR f.phone ILIKE $${params.length})`;
    return listWith(where + ` AND ${whereExtra}${sw}`, params, opts);
  }
  return listWith(where + sw, params, opts);

  async function listWith(fullWhere: string, p: unknown[], o: { page: number; pageSize: number }) {
    const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM families f ${fullWhere}`, p);
    const offset = (o.page - 1) * o.pageSize;
    const data = await query<any>(
      `SELECT f.*, (SELECT COUNT(*)::int FROM family_members fm WHERE fm.family_id = f.id) AS member_count,
              (SELECT m.first_name || ' ' || m.last_name FROM members m WHERE m.id = f.primary_contact_id) AS primary_contact
         FROM families f ${fullWhere}
        ORDER BY f.name ASC LIMIT ${o.pageSize} OFFSET ${offset}`,
      p,
    );
    return { data, meta: { page: o.page, pageSize: o.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / o.pageSize)) } };
  }
}

export async function getFamily(scope: AccessScope, id: string) {
  const [sw0, sp] = branchScopeWhere(scope, 'f.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const fam = await queryOne<any>(
    `SELECT f.*, (SELECT m.first_name || ' ' || m.last_name FROM members m WHERE m.id = f.primary_contact_id) AS primary_contact
       FROM families f WHERE f.id = $1 AND f.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!fam) throw ApiError.notFound('Family not found.');
  const members = await query<any>(
    `SELECT m.id, m.member_no, m.first_name, m.middle_name, m.last_name, m.phone, m.email, fm.role
       FROM family_members fm JOIN members m ON m.id = fm.member_id
      WHERE fm.family_id = $1 AND m.deleted_at IS NULL
      ORDER BY CASE fm.role WHEN 'head' THEN 0 WHEN 'spouse' THEN 1 WHEN 'child' THEN 2 ELSE 3 END, m.last_name`,
    [id],
  );
  return { family: fam, members };
}

export async function createFamily(scope: AccessScope, input: any, ip?: string) {
  if (!hasPermission(scope, 'families.create')) throw ApiError.forbidden();
  const fam = await tx(async (t) => {
    const rows = await t.query(
      `INSERT INTO families (org_id, branch_id, name, address, city, country, phone, email, primary_contact_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [scope.orgId, input.branch_id, input.name, input.address ?? null, input.city ?? null, input.country ?? null,
       input.phone ?? null, input.email ?? null, input.primary_contact_id ?? null, input.note ?? null],
    );
    const f = rows[0];
    const memberIds: string[] = input.member_ids ?? [];
    memberIds.forEach((mid: string, i: number) => {
      t.query('INSERT INTO family_members (family_id, member_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [f.id, mid, input.member_roles?.[mid] ?? 'member']);
    });
    // Keep member_relationships consistent for spouse/child links within the family
    const head = input.primary_contact_id ?? memberIds[0];
    if (head) {
      for (const mid of memberIds) {
        if (mid !== head) {
          await t.query(
            `INSERT INTO member_relationships (member_id, related_id, type) VALUES ($1,$2,'household')
               ON CONFLICT DO NOTHING`,
            [head, mid],
          );
        }
      }
    }
    return f;
  });
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'family.create', entity: 'family', entityId: fam.id, branchId: input.branch_id, ip, metadata: { name: input.name } });
  return fam;
}

export async function updateFamily(scope: AccessScope, id: string, input: any, ip?: string) {
  if (!hasPermission(scope, 'families.edit')) throw ApiError.forbidden();
  const existing = await getFamily(scope, id);
  const updated = await queryOne<any>(
    `UPDATE families SET name = $2, address = $3, city = $4, country = $5, phone = $6, email = $7,
      primary_contact_id = $8, note = $9
     WHERE id = $1 RETURNING *`,
    [id, input.name ?? existing.family.name, input.address ?? existing.family.address, input.city ?? existing.family.city,
     input.country ?? existing.family.country, input.phone ?? existing.family.phone, input.email ?? existing.family.email,
     input.primary_contact_id ?? existing.family.primary_contact_id, input.note ?? existing.family.note],
  );
  if (Array.isArray(input.member_ids)) {
    await tx(async (t) => {
      await t.query('DELETE FROM family_members WHERE family_id = $1', [id]);
      input.member_ids.forEach((mid: string, i: number) => {
        t.query('INSERT INTO family_members (family_id, member_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, mid, input.member_roles?.[mid] ?? 'member']);
      });
    });
  }
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'family.update', entity: 'family', entityId: id, branchId: existing.family.branch_id, ip });
  return updated;
}

export async function archiveFamily(scope: AccessScope, id: string, ip?: string) {
  if (!hasPermission(scope, 'families.delete')) throw ApiError.forbidden();
  await query('UPDATE families SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'family.delete', entity: 'family', entityId: id, ip, metadata: { soft: true } });
  return { id };
}
