/**
 * @nazareth/core — centralized reporting + exports.
 *
 * Reports are defined here (code, required permission, params, query) so the
 * UI renders one generic report runner. Every export is audit-logged
 * (reports.export) — sensitive exports are explicitly flagged.
 */
import { query, queryOne, type PageMeta } from '@nazareth/db';
import { ApiError } from '../errors';
import { hasPermission, type AccessScope } from '../rbac/scope';
import { branchScopeWhere } from '../rbac/scope';
import { audit } from '../audit/auditService';

export interface ReportDef {
  code: string;
  name: string;
  group: 'membership' | 'attendance' | 'events' | 'finance' | 'pastoral';
  description: string;
  permission: string;
  sensitive?: boolean;
  params: { key: string; label: string; type: 'date' | 'select' | 'number'; options?: (scope: AccessScope) => Promise<{ value: string; label: string }[]> }[];
  run: (scope: AccessScope, p: Record<string, string>) => Promise<{ columns: string[]; rows: (string | number | null)[][] }>;
}

interface BaseParams {
  from?: string;
  to?: string;
  branch_id?: string;
}

function dateRangeWhere(p: BaseParams): [string, unknown[]] {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (p.from) { params.push(p.from); parts.push(`tx_date >= $${params.length}`); }
  if (p.to) { params.push(p.to); parts.push(`tx_date <= $${params.length}`); }
  return [parts.length ? ` AND (${parts.join(' AND ')})` : '', params];
}

async function branchOptions(scope: AccessScope) {
  if (scope.branchIds === null) return (await query<any>('SELECT id, name FROM branches WHERE is_active ORDER BY name')).map((b) => ({ value: b.id, label: b.name }));
  return (await query<any>('SELECT id, name FROM branches WHERE id = ANY($1::uuid[])', [scope.branchIds])).map((b) => ({ value: b.id, label: b.name }));
}

export const REPORTS: ReportDef[] = [
  {
    code: 'membership_summary',
    name: 'Membership Summary',
    group: 'membership',
    description: 'Member counts by status, branch, gender and age band.',
    permission: 'reports.view',
    params: [
      { key: 'branch_id', label: 'Branch', type: 'select', options: branchOptions },
    ],
    run: async (scope, p) => {
      const [sw, sp] = branchScopeWhere(scope, 'm.branch_id');
      const extra = p.branch_id ? ` AND m.branch_id = $${sp.length + 1}` : '';
      const rows = await query<any>(
        `SELECT m.status, b.name AS branch, m.gender,
                CASE WHEN m.date_of_birth IS NULL THEN 'unknown'
                     WHEN EXTRACT(YEAR FROM AGE(m.date_of_birth)) < 12 THEN '0-11'
                     WHEN EXTRACT(YEAR FROM AGE(m.date_of_birth)) < 18 THEN '12-17'
                     WHEN EXTRACT(YEAR FROM AGE(m.date_of_birth)) < 30 THEN '18-29'
                     WHEN EXTRACT(YEAR FROM AGE(m.date_of_birth)) < 45 THEN '30-44'
                     WHEN EXTRACT(YEAR FROM AGE(m.date_of_birth)) < 60 THEN '45-59'
                     ELSE '60+' END AS age_band,
                COUNT(*)::int AS members
         FROM members m JOIN branches b ON b.id = m.branch_id
        WHERE m.deleted_at IS NULL${sw}${extra}
        GROUP BY 1,2,3,4 ORDER BY 2,1`,
        p.branch_id ? [...sp, p.branch_id] : sp,
      );
      return { columns: ['Status', 'Branch', 'Gender', 'Age band', 'Members'], rows: rows.map((r) => [r.status, r.branch, r.gender ?? '—', r.age_band, r.members]) };
    },
  },
  {
    code: 'new_members',
    name: 'New Members',
    group: 'membership',
    description: 'Members who joined within the selected period.',
    permission: 'reports.view',
    sensitive: true,
    params: [
      { key: 'from', label: 'From', type: 'date' },
      { key: 'to', label: 'To', type: 'date' },
      { key: 'branch_id', label: 'Branch', type: 'select', options: branchOptions },
    ],
    run: async (scope, p) => {
      const [sw, sp] = branchScopeWhere(scope, 'm.branch_id');
      const where: string[] = ['m.deleted_at IS NULL', 'm.date_joined IS NOT NULL'];
      const params: unknown[] = [...sp];
      if (p.from) { params.push(p.from); where.push(`m.date_joined >= $${params.length}`); }
      if (p.to) { params.push(p.to); where.push(`m.date_joined <= $${params.length}`); }
      if (p.branch_id) { params.push(p.branch_id); where.push(`m.branch_id = $${params.length}`); }
      const rows = await query<any>(
        `SELECT m.member_no, m.first_name || ' ' || COALESCE(m.middle_name,'') || ' ' || m.last_name AS name,
                b.name AS branch, m.status, m.date_joined, m.gender
         FROM members m JOIN branches b ON b.id = m.branch_id
        WHERE ${where.join(' AND ')}${sw}
        ORDER BY m.date_joined DESC`,
        params,
      );
      return { columns: ['Member #', 'Name', 'Branch', 'Status', 'Date joined', 'Gender'], rows: rows.map((r) => [r.member_no, r.name, r.branch, r.status, r.date_joined, r.gender ?? '—']) };
    },
  },
  {
    code: 'attendance_trend',
    name: 'Attendance Trend (weekly)',
    group: 'attendance',
    description: 'Weekly present/absent counts for the last 12 weeks.',
    permission: 'reports.view',
    params: [],
    run: async (scope) => {
      const [sw, sp] = branchScopeWhere(scope, 'a.branch_id');
      const rows = await query<any>(
        `SELECT to_char(date_trunc('week', a.session_date), 'DD Mon YYYY') AS week,
                COUNT(DISTINCT a.service_id) AS services,
                COUNT(r.id) FILTER (WHERE r.status IN ('present','first_time','visitor')) AS present,
                COUNT(r.id) FILTER (WHERE r.status = 'absent') AS absent
         FROM attendance_sessions a
         LEFT JOIN attendance_records r ON r.session_id = a.id
        WHERE a.session_date >= current_date - 84${sw}
        GROUP BY 1 ORDER BY 1`,
        sp,
      );
      return { columns: ['Week', 'Services', 'Present', 'Absent'], rows: rows.map((r) => [r.week, r.services, r.present, r.absent]) };
    },
  },
  {
    code: 'attendance_by_service',
    name: 'Attendance by Service (8 weeks)',
    group: 'attendance',
    description: 'Average attendance per service.',
    permission: 'reports.view',
    params: [],
    run: async (scope) => {
      const [sw, sp] = branchScopeWhere(scope, 's.branch_id');
      const rows = await query<any>(
        `SELECT s.name, s.category,
                COUNT(DISTINCT a.id) AS sessions,
                ROUND(COUNT(r.id) FILTER (WHERE r.status IN ('present','first_time','visitor'))::numeric / NULLIF(COUNT(DISTINCT a.id),0), 1) AS avg_attendance
         FROM services s
         LEFT JOIN attendance_sessions a ON a.service_id = s.id AND a.session_date >= current_date - 56
         LEFT JOIN attendance_records r ON r.session_id = a.id
        WHERE s.is_active${sw}
        GROUP BY s.id ORDER BY avg_attendance DESC NULLS LAST`,
        sp,
      );
      return { columns: ['Service', 'Category', 'Sessions', 'Avg attendance'], rows: rows.map((r) => [r.name, r.category, r.sessions, r.avg_attendance ?? '—']) };
    },
  },
  {
    code: 'member_attendance',
    name: 'Member Attendance Rate (8 weeks)',
    group: 'attendance',
    description: 'Attendance rate per active member.',
    permission: 'reports.view',
    params: [],
    run: async (scope) => {
      const [sw, sp] = branchScopeWhere(scope, 'm.branch_id');
      const rows = await query<any>(
        `SELECT m.member_no, m.first_name || ' ' || m.last_name AS name,
                COUNT(DISTINCT a.id) FILTER (WHERE r.status IN ('present','first_time')) AS present_sessions,
                COUNT(DISTINCT a.id) AS total_sessions,
                CASE WHEN COUNT(DISTINCT a.id) = 0 THEN 0
                     ELSE ROUND(100.0 * COUNT(DISTINCT a.id) FILTER (WHERE r.status IN ('present','first_time')) / COUNT(DISTINCT a.id)) END AS rate
         FROM members m
         JOIN attendance_sessions a ON a.branch_id = m.branch_id AND a.session_date >= current_date - 56
         LEFT JOIN attendance_records r ON r.session_id = a.id AND r.member_id = m.id
        WHERE m.deleted_at IS NULL AND m.status = 'active'${sw}
        GROUP BY m.id ORDER BY rate ASC LIMIT 200`,
        sp,
      );
      return { columns: ['Member #', 'Name', 'Present', 'Services', 'Rate %'], rows: rows.map((r) => [r.member_no, r.name, r.present_sessions, r.total_sessions, r.rate]) };
    },
  },
  {
    code: 'event_registrations',
    name: 'Event Registrations',
    group: 'events',
    description: 'Registrations per event with statuses.',
    permission: 'reports.view',
    params: [],
    run: async (scope) => {
      const [sw, sp] = branchScopeWhere(scope, 'e.branch_id');
      const rows = await query<any>(
        `SELECT e.title, to_char(e.starts_at, 'DD MMM YYYY HH24:MI') AS starts, e.status AS event_status,
                COUNT(er.id) FILTER (WHERE er.status = 'registered') AS registered,
                COUNT(er.id) FILTER (WHERE er.status = 'attended') AS attended,
                COUNT(er.id) FILTER (WHERE er.status = 'absent') AS absent
         FROM events e
         LEFT JOIN event_registrations er ON er.event_id = e.id
        WHERE e.deleted_at IS NULL AND e.starts_at >= current_date - 90${sw}
        GROUP BY e.id ORDER BY e.starts_at DESC LIMIT 100`,
        sp,
      );
      return { columns: ['Event', 'Starts', 'Status', 'Registered', 'Attended', 'Absent'], rows: rows.map((r) => [r.title, r.starts, r.event_status, r.registered, r.attended, r.absent]) };
    },
  },
  {
    code: 'giving_by_fund',
    name: 'Giving by Fund',
    group: 'finance',
    description: 'Total giving per fund for the period.',
    permission: 'finance.view',
    sensitive: true,
    params: [
      { key: 'from', label: 'From', type: 'date' },
      { key: 'to', label: 'To', type: 'date' },
    ],
    run: async (scope, p) => {
      const [sw, sp] = branchScopeWhere(scope, 'g.branch_id');
      const [dr, drp] = dateRangeWhere(p);
      const rows = await query<any>(
        `SELECT gf.name AS fund, COUNT(g.id) AS transactions, COALESCE(SUM(g.amount) FILTER (WHERE g.status <> 'reversed'),0) AS total
         FROM giving_transactions g JOIN giving_funds gf ON gf.id = g.fund_id
        WHERE g.deleted_at IS NULL${dr}${sw}
        GROUP BY gf.id ORDER BY total DESC`,
        [...drp, ...sp],
      );
      return { columns: ['Fund', 'Transactions', 'Total'], rows: rows.map((r) => [r.fund, r.transactions, Number(r.total).toFixed(2)]) };
    },
  },
  {
    code: 'giving_by_member',
    name: 'Giving by Member',
    group: 'finance',
    description: 'Per-member giving totals for the period.',
    permission: 'finance.view',
    sensitive: true,
    params: [
      { key: 'from', label: 'From', type: 'date' },
      { key: 'to', label: 'To', type: 'date' },
    ],
    run: async (scope, p) => {
      const [sw, sp] = branchScopeWhere(scope, 'g.branch_id');
      const [dr, drp] = dateRangeWhere(p);
      const rows = await query<any>(
        `SELECT m.member_no, m.first_name || ' ' || m.last_name AS member,
                COUNT(g.id) FILTER (WHERE g.status <> 'reversed') AS gifts,
                COALESCE(SUM(g.amount) FILTER (WHERE g.status <> 'reversed'),0) AS total
         FROM giving_transactions g
         JOIN members m ON m.id = g.member_id
        WHERE g.deleted_at IS NULL AND g.member_id IS NOT NULL${dr}${sw}
        GROUP BY m.id ORDER BY total DESC`,
        [...drp, ...sp],
      );
      return { columns: ['Member #', 'Member', 'Gifts', 'Total'], rows: rows.map((r) => [r.member_no, r.member, r.gifts, Number(r.total).toFixed(2)]) };
    },
  },
  {
    code: 'expenses_by_category',
    name: 'Expenses by Category',
    group: 'finance',
    description: 'Approved/paid expenses by category.',
    permission: 'finance.view',
    sensitive: true,
    params: [
      { key: 'from', label: 'From', type: 'date' },
      { key: 'to', label: 'To', type: 'date' },
    ],
    run: async (scope, p) => {
      const [sw, sp] = branchScopeWhere(scope, 'e.branch_id');
      const where = ['e.status IN (\'approved\',\'paid\')', 'e.deleted_at IS NULL'];
      const params: unknown[] = [...sp];
      if (p.from) { params.push(p.from); where.push(`e.expense_date >= $${params.length}`); }
      if (p.to) { params.push(p.to); where.push(`e.expense_date <= $${params.length}`); }
      const rows = await query<any>(
        `SELECT ec.name AS category, COUNT(e.id) AS count, COALESCE(SUM(e.amount),0) AS total
         FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
        WHERE ${where.join(' AND ')}${sw}
        GROUP BY ec.id ORDER BY total DESC`,
        params,
      );
      return { columns: ['Category', 'Count', 'Total'], rows: rows.map((r) => [r.category, r.count, Number(r.total).toFixed(2)]) };
    },
  },
  {
    code: 'income_vs_expenses',
    name: 'Income vs Expenses (monthly)',
    group: 'finance',
    description: 'Monthly giving vs expenses for the last 12 months.',
    permission: 'finance.view',
    sensitive: true,
    params: [],
    run: async (scope) => {
      const [sw, sp] = branchScopeWhere(scope, 'g.branch_id');
      const [swE, spE] = branchScopeWhere(scope, 'e.branch_id', 2);
      const rows = await query<any>(
        `SELECT to_char(g.tx_date, 'YYYY-MM') AS month,
                COALESCE(SUM(g.amount) FILTER (WHERE g.status <> 'reversed'),0) AS income,
                0 AS expenses
         FROM giving_transactions g WHERE g.tx_date >= date_trunc('month', current_date) - 11 * interval '1 month'${sw}
         GROUP BY 1
        UNION ALL
        SELECT to_char(e.expense_date, 'YYYY-MM') AS month, 0, COALESCE(SUM(e.amount),0)
         FROM expenses e WHERE e.status IN ('approved','paid') AND e.expense_date >= date_trunc('month', current_date) - 11 * interval '1 month'${swE}
         GROUP BY 1
        ORDER BY 1`,
        [...sp, ...spE],
      );
      const map = new Map<string, [number, number]>();
      rows.forEach((r) => {
        const cur = map.get(r.month) ?? [0, 0];
        cur[0] += Number(r.income);
        cur[1] += Number(r.expenses);
        map.set(r.month, cur);
      });
      const out = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([m, [inc, exp]]) => [m, inc.toFixed(2), exp.toFixed(2), (inc - exp).toFixed(2)]);
      return { columns: ['Month', 'Income', 'Expenses', 'Net'], rows: out };
    },
  },
  {
    code: 'monthly_summary',
    name: 'Monthly Financial Summary',
    group: 'finance',
    description: 'Giving, expenses and net per month, per fund.',
    permission: 'finance.view',
    sensitive: true,
    params: [],
    run: async (scope) => {
      // Two CTEs (income / expense aggregated per month+fund) joined on month:
      // a correlated subquery would reference non-grouped g.tx_date and fail
      // with a grouping error.
      const [sw, sp] = branchScopeWhere(scope, 'g.branch_id');
      const [swE, spE] = branchScopeWhere(scope, 'e.branch_id', 2);
      const rows = await query<any>(
        `WITH income AS (
           SELECT date_trunc('month', g.tx_date) AS month, gf.id AS fund_id, gf.name AS fund,
                  COALESCE(SUM(g.amount) FILTER (WHERE g.status <> 'reversed'),0) AS income
             FROM giving_transactions g JOIN giving_funds gf ON gf.id = g.fund_id
            WHERE g.tx_date >= date_trunc('month', current_date) - 11 * interval '1 month'${sw}
            GROUP BY 1, gf.id, gf.name
         ),
         expense AS (
           SELECT date_trunc('month', e.expense_date) AS month, e.fund_id,
                  COALESCE(SUM(e.amount),0) AS expenses
             FROM expenses e
            WHERE e.status IN ('approved','paid')
              AND e.expense_date >= date_trunc('month', current_date) - 11 * interval '1 month'${swE}
            GROUP BY 1, 2
         )
         SELECT to_char(i.month,'YYYY-MM') AS month, i.fund, i.income, COALESCE(x.expenses,0) AS expenses
           FROM income i LEFT JOIN expense x ON x.month = i.month AND x.fund_id = i.fund_id
          ORDER BY i.month, i.fund`,
        [...sp, ...spE],
      );
      return { columns: ['Month', 'Fund', 'Income', 'Expenses', 'Net'], rows: rows.map((r) => [r.month, r.fund, Number(r.income).toFixed(2), Number(r.expenses).toFixed(2), (Number(r.income) - Number(r.expenses)).toFixed(2)]) };
    },
  },
  {
    code: 'pastoral_open_cases',
    name: 'Open Pastoral Cases',
    group: 'pastoral',
    description: 'All open and in-progress pastoral cases.',
    permission: 'pastoral.view',
    sensitive: true,
    params: [],
    run: async (scope) => {
      const rows = await query<any>(
        `SELECT c.title, c.type, c.status, to_char(c.opened_at,'DD MMM YYYY') AS opened,
                m.first_name || ' ' || m.last_name AS member, u.name AS assigned_to
         FROM pastoral_cases c JOIN members m ON m.id = c.member_id
         LEFT JOIN users u ON u.id = c.assigned_to
        WHERE c.deleted_at IS NULL AND c.status IN ('open','in_progress')
        ORDER BY c.opened_at DESC`,
      );
      return { columns: ['Title', 'Type', 'Status', 'Opened', 'Member', 'Assigned to'], rows: rows.map((r) => [r.title, r.type, r.status, r.opened, r.member, r.assigned_to ?? '—']) };
    },
  },
  {
    code: 'prayer_active',
    name: 'Active Prayer Requests',
    group: 'pastoral',
    description: 'Currently active prayer requests (visible per your access).',
    permission: 'prayer.view',
    params: [],
    run: async (scope) => {
      const { listPrayerRequests } = await import('../prayer/prayerService');
      const res = await listPrayerRequests(scope, { status: 'active', page: 1, pageSize: 200 });
      return { columns: ['Submitted', 'Member', 'Category', 'Visibility', 'Request'], rows: res.data.map((r) => [r.created_at.slice(0, 10), r.member_name ?? r.submitted_by_name, r.category, r.visibility, r.text.slice(0, 120)]) };
    },
  },
];

export function getReport(code: string): ReportDef {
  const r = REPORTS.find((x) => x.code === code);
  if (!r) throw ApiError.notFound('Report not found.');
  return r;
}

export async function runReport(scope: AccessScope, code: string, params: Record<string, string>): Promise<{ columns: string[]; rows: (string | number | null)[][] }> {
  const r = getReport(code);
  if (!hasPermission(scope, r.permission)) throw ApiError.forbidden('You do not have permission to view this report.');
  return r.run(scope, params);
}

/* ─────────────────────────── Saved filters ─────────────────────────── */

export interface SavedFilter {
  id: string;
  name: string;
  report_code: string;
  params: Record<string, string>;
  created_at: string;
}

export async function listSavedFilters(scope: AccessScope, userId: string): Promise<SavedFilter[]> {
  const rows = await query<any>(
    `SELECT id, name, report_code, params, created_at FROM saved_report_filters WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, report_code: r.report_code, params: r.params ?? {}, created_at: r.created_at }));
}

export async function saveFilter(scope: AccessScope, input: { name: string; report_code: string; params?: Record<string, string> }, ip?: string): Promise<SavedFilter> {
  getReport(input.report_code); // must exist (throws 404 otherwise)
  const row = await queryOne<any>(
    `INSERT INTO saved_report_filters (user_id, report_code, name, params) VALUES ($1,$2,$3,$4) RETURNING *`,
    [scope.userId, input.report_code, input.name, input.params ?? {}],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'report.save_filter', entity: 'saved_report_filter', entityId: row.id, ip, metadata: { report: input.report_code } });
  return { id: row.id, name: row.name, report_code: row.report_code, params: row.params ?? {}, created_at: row.created_at };
}

export async function deleteSavedFilter(scope: AccessScope, filterId: string): Promise<void> {
  await query('DELETE FROM saved_report_filters WHERE id = $1 AND user_id = $2', [filterId, scope.userId]);
}

/* ─────────────────────────── Exports ─────────────────────────── */

export function toCsv(columns: string[], rows: (string | number | null)[][]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined
      ? ''
      : v instanceof Date
        ? v.toISOString().slice(0, 10)
        : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

export function toXlsx(columns: string[], rows: (string | number | null)[][], filename: string): Buffer {
  // SheetJS (xlsx) — pure JS, server-side.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  ws['!cols'] = columns.map((c, i) => ({ wch: Math.max(c.length + 2, ...rows.slice(0, 50).map((r) => String(r[i] ?? '').length + 2), 10) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function toPdf(columns: string[], rows: (string | number | null)[][], title: string, subtitle: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  doc.font('Helvetica-Bold').fontSize(16).text(title, { continued: false });
  doc.font('Helvetica').fontSize(10).fillColor('#555').text(subtitle);
  doc.moveDown();
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidths = columns.map(() => Math.floor(tableWidth / columns.length));
  const drawRow = (cells: (string | number | null)[], bold: boolean) => {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const x0 = doc.page.margins.left;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(bold ? '#1e3a8a' : '#000');
    let x = x0;
    cells.forEach((cell, i) => {
      doc.text(String(cell ?? ''), x, doc.y, { width: colWidths[i] - 6, lineBreak: false, ellipsis: true });
      x += colWidths[i];
    });
    doc.y += 14;
  };
  drawRow(columns, true);
  rows.slice(0, 500).forEach((r) => drawRow(r, false));
  doc.moveDown(2);
  doc.font('Helvetica').fontSize(8).fillColor('#888').text(`Generated ${new Date().toISOString()} — Nazareth Parish ChMS`);
  doc.end();
  return Promise.resolve(new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  }));
}

export async function exportReport(scope: AccessScope, code: string, params: Record<string, string>, format: 'csv' | 'xlsx' | 'pdf', ip?: string) {
  const r = getReport(code);
  if (!hasPermission(scope, r.permission)) throw ApiError.forbidden();
  const { columns, rows } = await r.run(scope, params);
  let body: Buffer;
  let mime: string;
  let ext: string;
  if (format === 'csv') { body = Buffer.from(toCsv(columns, rows), 'utf8'); mime = 'text/csv'; ext = 'csv'; }
  else if (format === 'xlsx') { body = toXlsx(columns, rows, code); mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; ext = 'xlsx'; }
  else { body = await toPdf(columns, rows, r.name, r.description); mime = 'application/pdf'; ext = 'pdf'; }
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'reports.export', entity: 'report', entityId: code, ip, metadata: { format, rows: rows.length, sensitive: Boolean(r.sensitive), params } });
  return { body, mime, ext, filename: `${code}_${new Date().toISOString().slice(0, 10)}.${ext}` };
}
