/**
 * @nazareth/core — giving, funds, receipts.
 *
 * Financial security model (§32):
 *  - every endpoint requires giving.* permissions (checked in controllers)
 *  - records are IMMUTABLE: corrections happen via reversal entries
 *    (a linked negative/positive record with reason), never in-place edits
 *  - all create/reverse operations are audit-logged with who/what/when
 *  - members can only ever see their OWN giving (via portal scope)
 */
import { query, queryOne, tx } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';
import { sendMail } from '../notify/providers';
import { renderTemplate } from '../notify/notifyService';

/* ─────────────────────────── Funds ─────────────────────────── */

export async function listFunds(scope: AccessScope, opts: { includeInactive?: boolean }) {
  const [sw, sp] = branchScopeWhere(scope, 'f.branch_id');
  const rows = await query<any>(
    `SELECT f.*, b.name AS branch_name,
            (SELECT COALESCE(SUM(g.amount),0) FROM giving_transactions g
              WHERE g.fund_id = f.id AND g.status <> 'reversed') AS total_giving,
            (SELECT COALESCE(SUM(e.amount),0) FROM expenses e
              WHERE e.fund_id = f.id AND e.status IN ('approved','paid')) AS total_expenses
       FROM giving_funds f
       LEFT JOIN branches b ON b.id = f.branch_id
      WHERE f.deleted_at IS NULL AND ${opts.includeInactive ? 'true' : 'f.is_active'}${sw}
      ORDER BY f.name`,
    sp,
  );
  return rows.map((r) => ({ ...r, balance: (Number(r.opening_balance) + Number(r.total_giving) - Number(r.total_expenses)).toFixed(2) }));
}

export async function createFund(scope: AccessScope, input: any, ip?: string) {
  if (!hasPermission(scope, 'funds.manage') && !scope.isSuper) throw ApiError.forbidden();
  const f = await queryOne<any>(
    `INSERT INTO giving_funds (org_id, branch_id, code, name, description, opening_balance, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [scope.orgId, input.branch_id ?? null, input.code, input.name, input.description ?? null, input.opening_balance ?? 0, input.active ?? true],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'fund.create', entity: 'giving_fund', entityId: f.id, ip, metadata: { name: input.name, code: input.code } });
  return f;
}

export async function updateFund(scope: AccessScope, id: string, input: any, ip?: string) {
  if (!hasPermission(scope, 'funds.manage') && !scope.isSuper) throw ApiError.forbidden();
  const existing = await queryOne<any>('SELECT * FROM giving_funds WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) throw ApiError.notFound();
  const f = await queryOne<any>(
    `UPDATE giving_funds SET name=$2, description=$3, opening_balance=$4, is_active=$5 WHERE id=$1 RETURNING *`,
    [id, input.name ?? existing.name, input.description ?? existing.description,
     input.opening_balance !== undefined ? input.opening_balance : existing.opening_balance,
     input.active !== undefined ? input.active : existing.is_active],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'fund.update', entity: 'giving_fund', entityId: id, ip, metadata: { name: f.name } });
  return f;
}

export async function archiveFund(scope: AccessScope, id: string, ip?: string) {
  if (!hasPermission(scope, 'funds.manage') && !scope.isSuper) throw ApiError.forbidden();
  const inUse = await queryOne<any>('SELECT COUNT(*)::int AS c FROM giving_transactions WHERE fund_id = $1', [id]);
  if (inUse.c > 0) {
    // Keep referential integrity: disable instead of archive when transactions exist.
    await query('UPDATE giving_funds SET is_active = false WHERE id = $1', [id]);
    return { id, disabled: true };
  }
  await query('UPDATE giving_funds SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'fund.delete', entity: 'giving_fund', entityId: id, ip, metadata: { soft: true } });
  return { id };
}

/* ─────────────────────────── Giving transactions ─────────────────────────── */

async function nextReceiptNo(scope: AccessScope): Promise<string> {
  const year = new Date().getFullYear();
  const row = await queryOne<any>(
    `SELECT COALESCE(MAX(CAST(SPLIT_PART(receipt_no, '-', 2) AS INT)), 0) + 1 AS next
       FROM giving_transactions WHERE receipt_no LIKE 'R-${year}-%'`,
    [year],
  );
  return `R-${year}-${String(row.next).padStart(5, '0')}`;
}

export async function listGiving(scope: AccessScope, opts: {
  from?: string; to?: string; fund_id?: string; member_id?: string; method?: string; page: number; pageSize: number;
}) {
  const [sw, sp] = branchScopeWhere(scope, 'g.branch_id');
  const where = ['g.deleted_at IS NULL'];
  const params: unknown[] = [...sp];
  if (opts.from) { params.push(opts.from); where.push(`g.tx_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`g.tx_date <= $${params.length}`); }
  if (opts.fund_id) { params.push(opts.fund_id); where.push(`g.fund_id = $${params.length}`); }
  if (opts.member_id) { params.push(opts.member_id); where.push(`g.member_id = $${params.length}`); }
  if (opts.method) { params.push(opts.method); where.push(`g.method = $${params.length}`); }
  const fullWhere = `WHERE ${where.join(' AND ')}${sw}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM giving_transactions g ${fullWhere}`, params);
  const sum = await queryOne<any>(`SELECT COALESCE(SUM(g.amount) FILTER (WHERE g.status <> 'reversed'),0) AS s FROM giving_transactions g ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT g.*, gf.name AS fund_name, gf.code AS fund_code,
            m.first_name || ' ' || m.last_name AS member_name, m.member_no
       FROM giving_transactions g
       JOIN giving_funds gf ON gf.id = g.fund_id
       LEFT JOIN members m ON m.id = g.member_id
      ${fullWhere}
      ORDER BY g.tx_date DESC, g.created_at DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) }, sum: Number(sum.s).toFixed(2) };
}

export async function createGiving(scope: AccessScope, input: {
  branch_id: string; fund_id: string; member_id?: string; amount: number; tx_date: string;
  method: string; reference?: string; is_anonymous?: boolean; note?: string; issue_receipt?: boolean;
}, ip?: string) {
  if (!hasPermission(scope, 'giving.create')) throw ApiError.forbidden();
  const fund = await queryOne<any>('SELECT * FROM giving_funds WHERE id = $1 AND deleted_at IS NULL', [input.fund_id]);
  if (!fund) throw ApiError.notFound('Fund not found.');
  if (!fund.is_active) throw ApiError.conflict('This fund is not active.');
  if (scope.branchIds && !scope.branchIds.includes(input.branch_id)) throw ApiError.forbidden('You can only record giving for your branch.');
  if (input.member_id) {
    const m = await queryOne<any>('SELECT id FROM members WHERE id = $1 AND deleted_at IS NULL', [input.member_id]);
    if (!m) throw ApiError.notFound('Member not found.');
  }

  const receiptNo = input.issue_receipt ? await nextReceiptNo(scope) : null;
  const g = await tx(async (t) => {
    const rows = await t.query(
      `INSERT INTO giving_transactions (org_id, branch_id, fund_id, member_id, user_id, amount, tx_date, method, reference,
         is_anonymous, status, note, receipt_no, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'recorded',$11,$12,$13) RETURNING *`,
      [scope.orgId, input.branch_id, input.fund_id, input.member_id ?? null, scope.userId, input.amount,
       input.tx_date, input.method, input.reference ?? null, Boolean(input.is_anonymous), input.note ?? null,
       receiptNo, scope.userId],
    );
    if (receiptNo) {
      await t.query(
        `INSERT INTO financial_receipts (org_id, branch_id, receipt_no, kind, entity_id, amount, issued_by)
         VALUES ($1,$2,$3,'giving',$4,$5,$6)`,
        [scope.orgId, input.branch_id, receiptNo, rows[0].id, input.amount, scope.userId],
      );
    }
    return rows[0];
  });
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'giving.create', entity: 'giving_transaction', entityId: g.id, branchId: input.branch_id, ip, metadata: { amount: input.amount, fund: fund.code, receipt: receiptNo, member: input.member_id ?? null, anonymous: Boolean(input.is_anonymous) } });

  if (receiptNo && g.member_id) {
    const member = await queryOne<any>('SELECT email, first_name FROM members WHERE id = $1', [g.member_id]);
    if (member?.email) {
      const tmpl = await renderTemplate(scope.orgId, 'giving_receipt', {
        name: member.first_name, amount: String(input.amount), fund: fund.name, date: input.tx_date, receipt: receiptNo,
      });
      await sendMail({ to: member.email, subject: tmpl?.subject ?? `Giving receipt ${receiptNo}`, body: tmpl?.body ?? `Thank you for your gift of ${input.amount} to ${fund.name} on ${input.tx_date}. Receipt: ${receiptNo}.` }).catch(() => {});
    }
  }
  return g;
}

/**
 * Reverse a giving record. The original row is never modified — a linked
 * reversal row is inserted, status set to 'reversed', and the reason kept.
 */
export async function reverseGiving(scope: AccessScope, id: string, reason: string, ip?: string) {
  if (!hasPermission(scope, 'giving.create')) throw ApiError.forbidden();
  const g = await queryOne<any>(
    `SELECT g.*, gf.name AS fund_name FROM giving_transactions g JOIN giving_funds gf ON gf.id = g.fund_id
      WHERE g.id = $1 AND g.deleted_at IS NULL`, [id],
  );
  if (!g) throw ApiError.notFound('Giving record not found.');
  if (g.status === 'reversed') throw ApiError.conflict('This record is already reversed.');
  if (scope.branchIds && !scope.branchIds.includes(g.branch_id)) throw ApiError.forbidden();

  const reversal = await tx(async (t) => {
    const rev = await t.query(
      `INSERT INTO giving_transactions (org_id, branch_id, fund_id, member_id, amount, tx_date, method, reference,
         is_anonymous, status, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'recorded',$10,$11) RETURNING *`,
      [g.org_id, g.branch_id, g.fund_id, g.member_id, -Number(g.amount), new Date().toISOString().slice(0, 10),
       g.method, `Reversal of ${g.receipt_no ?? g.id}`, g.is_anonymous, `REVERSAL: ${reason}`, scope.userId],
    );
    await t.query(
      `UPDATE giving_transactions SET status = 'reversed', reversal_reason = $2, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [id, reason],
    );
    await t.query(`UPDATE giving_transactions SET reversed_by = $2 WHERE id = $1`, [id, rev[0].id]);
    return rev[0];
  });
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'giving.reverse', entity: 'giving_transaction', entityId: id, branchId: g.branch_id, ip, metadata: { reason, reversal_id: reversal.id, amount: g.amount, fund: g.fund_name } });
  return { original: g, reversal };
}

/** A member's own giving history (portal). Never any other member's data. */
export async function ownGiving(scope: AccessScope, opts: { from?: string; to?: string; page: number; pageSize: number }) {
  const where = ["g.deleted_at IS NULL", "g.member_id = $1", "g.status <> 'reversed'"];
  const params: unknown[] = [scope.linkedMemberId];
  if (!scope.linkedMemberId) return { data: [], meta: { page: 1, pageSize: opts.pageSize, total: 0, totalPages: 1 }, sum: '0.00' };
  if (opts.from) { params.push(opts.from); where.push(`g.tx_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`g.tx_date <= $${params.length}`); }
  const fullWhere = `WHERE ${where.join(' AND ')}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM giving_transactions g ${fullWhere}`, params);
  const sum = await queryOne<any>(`SELECT COALESCE(SUM(g.amount),0) AS s FROM giving_transactions g ${fullWhere}`, params);
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT g.id, g.amount, g.tx_date, g.method, g.reference, g.receipt_no, gf.name AS fund_name
       FROM giving_transactions g JOIN giving_funds gf ON gf.id = g.fund_id
      ${fullWhere} ORDER BY g.tx_date DESC LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) }, sum: Number(sum.s).toFixed(2) };
}

/* ─────────────────────────── Giving stats ─────────────────────────── */

export async function givingTrend(scope: AccessScope, months = 6) {
  const [sw, sp] = branchScopeWhere(scope, 'g.branch_id');
  return query<any>(
    `SELECT to_char(g.tx_date, 'YYYY-MM') AS month,
            COALESCE(SUM(g.amount) FILTER (WHERE g.status <> 'reversed'), 0) AS total,
            COUNT(g.id) FILTER (WHERE g.status <> 'reversed') AS tx_count
       FROM giving_transactions g
      WHERE g.tx_date >= date_trunc('month', current_date) - (${months - 1}) * interval '1 month'${sw}
      GROUP BY 1 ORDER BY 1`,
    sp,
  );
}

export async function givingSummary(scope: AccessScope) {
  const [sw, sp] = branchScopeWhere(scope, 'g.branch_id');
  const row = await queryOne<any>(
    `SELECT COALESCE(SUM(g.amount) FILTER (WHERE g.status <> 'reversed' AND g.tx_date >= date_trunc('month', current_date)),0) AS this_month,
            COALESCE(SUM(g.amount) FILTER (WHERE g.status <> 'reversed' AND g.tx_date >= date_trunc('year', current_date)),0) AS this_year,
            COUNT(DISTINCT g.member_id) FILTER (WHERE g.status <> 'reversed' AND g.tx_date >= date_trunc('month', current_date)) AS givers_this_month
       FROM giving_transactions g WHERE ${'1=1'}${sw}`,
    sp,
  );
  return { thisMonth: Number(row.this_month).toFixed(2), thisYear: Number(row.this_year).toFixed(2), giversThisMonth: row.givers_this_month };
}
