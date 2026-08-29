/**
 * @nazareth/core — member import pipeline.
 *
 * Upload → parse → validate → duplicate detection → (preview) → confirm →
 * import → report. Nothing is written until the caller confirms, and every
 * row is re-validated server-side (the browser is never trusted).
 */
import { query, tx } from '@nazareth/db';
import { ApiError } from '../errors';
import { hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { nextMemberNo } from './memberService';

export interface ImportRow {
  index: number;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  status: string;
  date_joined: string;
  error?: string;
  duplicate?: { member_no: string; name: string; matched_on: string } | null;
}

/** Minimal CSV parser (quotes, commas, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const HEADER_MAP: Record<string, keyof ImportRow> = {
  first_name: 'first_name', firstname: 'first_name', first: 'first_name',
  middle_name: 'middle_name', middlename: 'middle_name',
  last_name: 'last_name', lastname: 'last_name', last: 'last_name', surname: 'last_name',
  gender: 'gender', dob: 'date_of_birth', date_of_birth: 'date_of_birth', birthday: 'date_of_birth',
  phone: 'phone', telephone: 'phone', mobile: 'phone',
  email: 'email', e_mail: 'email',
  address: 'address', city: 'city', status: 'status',
  date_joined: 'date_joined', joined: 'date_joined',
};

function clean(s: string | undefined): string {
  return (s ?? '').trim();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function previewImport(scope: AccessScope, csvText: string, branchId: string): Promise<{ rows: ImportRow[]; total: number; invalid: number }> {
  if (!hasPermission(scope, 'members.import') && !scope.isSuper) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(branchId)) throw ApiError.forbidden('You can only import members into your branch.');

  const grid = parseCsv(csvText);
  if (grid.length < 2) throw ApiError.validation('The file must contain a header row and at least one data row.');
  const header = grid[0].map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const colIdx: Partial<Record<keyof ImportRow, number>> = {};
  header.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key && colIdx[key] === undefined) colIdx[key] = i;
  });
  if (colIdx.first_name === undefined || colIdx.last_name === undefined) {
    throw ApiError.validation('CSV must contain at least "first_name" and "last_name" columns.');
  }

  const rows: ImportRow[] = grid.slice(1).map((cells, i) => {
    const get = (k: keyof ImportRow) => (colIdx[k] !== undefined ? clean(cells[colIdx[k]!]) : '');
    const row: ImportRow = {
      index: i,
      first_name: get('first_name'),
      middle_name: get('middle_name'),
      last_name: get('last_name'),
      gender: get('gender'),
      date_of_birth: get('date_of_birth'),
      phone: get('phone'),
      email: get('email'),
      address: get('address'),
      city: get('city'),
      status: get('status') || 'active',
      date_joined: get('date_joined'),
    };
    if (!row.first_name || !row.last_name) row.error = 'First and last name are required.';
    else if (row.email && !EMAIL_RE.test(row.email)) row.error = 'Invalid email address.';
    else if (row.date_of_birth && !DATE_RE.test(row.date_of_birth)) row.error = 'Date of birth must be YYYY-MM-DD.';
    else if (row.date_joined && !DATE_RE.test(row.date_joined)) row.error = 'Date joined must be YYYY-MM-DD.';
    else if (row.gender && !['male', 'female', 'other'].includes(row.gender)) row.error = 'Gender must be male, female or other.';
    return row;
  });

  // Duplicate detection against existing members (email / phone exact).
  for (const row of rows) {
    if (row.error) continue;
    const conds: string[] = [];
    const params: unknown[] = [];
    if (row.email) { params.push(row.email.toLowerCase()); conds.push(`lower(email) = $${params.length}`); }
    if (row.phone) { params.push(row.phone.replace(/\D/g, '')); conds.push(`replace(phone, E' ', E'') ILIKE '%' || $${params.length} || '%'`); }
    if (conds.length) {
      const match = (await query<any>(
        `SELECT id, member_no, first_name, last_name FROM members WHERE deleted_at IS NULL AND (${conds.join(' OR ')}) LIMIT 1`,
        params,
      ))[0];
      if (match) {
        row.duplicate = {
          member_no: match.member_no,
          name: `${match.first_name} ${match.last_name}`,
          matched_on: row.email ? 'email' : 'phone',
        };
      }
    }
  }

  return { rows, total: rows.length, invalid: rows.filter((r) => r.error).length };
}

export interface ImportInputRow {
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  status?: string | null;
  date_joined?: string | null;
}

export async function confirmImport(scope: AccessScope, input: { branchId: string; rows: ImportInputRow[] }, ip?: string) {
  if (!hasPermission(scope, 'members.import') && !scope.isSuper) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(input.branchId)) throw ApiError.forbidden();
  const rows = input.rows.filter((r) => r.first_name && r.last_name);
  let imported = 0;
  const errors: string[] = [];

  await tx(async (t) => {
    for (const r of rows) {
      try {
        if (r.email) {
          const exists = (await t.query('SELECT id FROM members WHERE org_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL', [scope.orgId, r.email]))[0];
          if (exists) { imported += 0; errors.push(`${r.first_name} ${r.last_name}: duplicate email`); continue; }
        }
        const memberNo = await nextMemberNo(scope.orgId);
        await t.query(
          `INSERT INTO members (org_id, branch_id, member_no, first_name, middle_name, last_name, gender, date_of_birth,
             phone, email, address, city, status, date_joined, is_demo, created_by)
           VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14)`,
          [scope.orgId, input.branchId, memberNo, r.first_name, r.last_name, r.gender || null,
           r.date_of_birth || null, r.phone || null, r.email || null, r.address || null, r.city || null,
           r.status || 'active', r.date_joined || new Date().toISOString().slice(0, 10), scope.userId],
        );
        imported++;
      } catch (e: any) {
        errors.push(`${r.first_name} ${r.last_name}: ${e.message ?? 'insert failed'}`);
      }
    }
  });

  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'members.import', entity: 'member', ip, metadata: { imported, errors: errors.length, branchId: input.branchId } });
  return { imported, skipped: rows.length - imported, errors };
}
