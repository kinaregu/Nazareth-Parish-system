/**
 * @nazareth/core — expenses with an approval workflow.
 *
 * Workflow: draft → submitted → approved | rejected → (approved →) paid
 *
 * Controls:
 *  - submitter and approver must be DIFFERENT users (DB check + service check)
 *  - only expenses.approve holders can approve/reject/pay
 *  - every transition is audit-logged with the acting user
 *  - paid expenses become immutable (no further status changes)
 */
import { query, queryOne, queryCol } from '@nazareth/db';
import { ApiError } from '../errors';
import { branchScopeWhere, hasPermission, type AccessScope } from '../rbac/scope';
import { audit } from '../audit/auditService';

export async function listCategories(scope: AccessScope) {
  return query<any>('SELECT * FROM expense_categories WHERE org_id = $1 ORDER BY name', [scope.orgId]);
}

export async function createCategory(scope: AccessScope, name: string, description?: string) {
  if (!hasPermission(scope, 'expenses.create') && !scope.isSuper) throw ApiError.forbidden();
  return queryOne<any>(
    'INSERT INTO expense_categories (org_id, name, description) VALUES ($1,$2,$3) ON CONFLICT (org_id, name) DO UPDATE SET is_active = true RETURNING *',
    [scope.orgId, name, description ?? null],
  );
}

export async function listExpenses(scope: AccessScope, opts: {
  status?: string; fund_id?: string; category_id?: string; from?: string; to?: string; page: number; pageSize: number;
}) {
  const [sw, sp] = branchScopeWhere(scope, 'e.branch_id');
  const where = ['e.deleted_at IS NULL'];
  const params: unknown[] = [...sp];
  if (opts.status) { params.push(opts.status); where.push(`e.status = $${params.length}`); }
  if (opts.fund_id) { params.push(opts.fund_id); where.push(`e.fund_id = $${params.length}`); }
  if (opts.category_id) { params.push(opts.category_id); where.push(`e.category_id = $${params.length}`); }
  if (opts.from) { params.push(opts.from); where.push(`e.expense_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`e.expense_date <= $${params.length}`); }
  const fullWhere = `WHERE ${where.join(' AND ')}${sw}`;
  const total = await queryOne<any>(`SELECT COUNT(*)::int AS c FROM expenses e ${fullWhere}`, params);
  const sum = await queryOne<any>(
    `SELECT COALESCE(SUM(e.amount) FILTER (WHERE e.status IN ('approved','paid')),0) AS s FROM expenses e ${fullWhere}`, params,
  );
  const offset = (opts.page - 1) * opts.pageSize;
  const data = await query<any>(
    `SELECT e.*, gf.name AS fund_name, ec.name AS category_name,
            u1.name AS submitted_by_name, u2.name AS approved_by_name, u3.name AS paid_by_name
       FROM expenses e
       JOIN giving_funds gf ON gf.id = e.fund_id
       JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u1 ON u1.id = e.submitted_by
       LEFT JOIN users u2 ON u2.id = e.approved_by
       LEFT JOIN users u3 ON u3.id = e.paid_by
      ${fullWhere}
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}`,
    params,
  );
  return { data, meta: { page: opts.page, pageSize: opts.pageSize, total: total.c, totalPages: Math.max(1, Math.ceil(total.c / opts.pageSize)) }, sum: Number(sum.s).toFixed(2) };
}

export async function getExpense(scope: AccessScope, id: string) {
  const [sw0, sp] = branchScopeWhere(scope, 'e.branch_id');
  const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
  const e = await queryOne<any>(
    `SELECT e.*, gf.name AS fund_name, ec.name AS category_name,
            u1.name AS submitted_by_name, u2.name AS approved_by_name, u3.name AS paid_by_name
       FROM expenses e
       JOIN giving_funds gf ON gf.id = e.fund_id
       JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u1 ON u1.id = e.submitted_by
       LEFT JOIN users u2 ON u2.id = e.approved_by
       LEFT JOIN users u3 ON u3.id = e.paid_by
      WHERE e.id = $1 AND e.deleted_at IS NULL${sw}`,
    [id, ...sp],
  );
  if (!e) throw ApiError.notFound('Expense not found.');
  return e;
}

export async function createExpense(scope: AccessScope, input: {
  branch_id: string; fund_id: string; category_id: string; title: string; description?: string;
  amount: number; expense_date: string; vendor?: string; method: string; reference?: string;
  receipt_file_id?: string; submit?: boolean;
}, ip?: string) {
  if (!hasPermission(scope, 'expenses.create') && !scope.isSuper) throw ApiError.forbidden();
  if (scope.branchIds && !scope.branchIds.includes(input.branch_id)) throw ApiError.forbidden();
  const status = input.submit ? 'submitted' : 'draft';
  const e = await queryOne<any>(
    `INSERT INTO expenses (org_id, branch_id, fund_id, category_id, title, description, amount, expense_date,
       vendor, method, reference, receipt_file_id, status, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [scope.orgId, input.branch_id, input.fund_id, input.category_id, input.title, input.description ?? null,
     input.amount, input.expense_date, input.vendor ?? null, input.method, input.reference ?? null,
     input.receipt_file_id ?? null, status, input.submit ? scope.userId : null],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'expense.create', entity: 'expense', entityId: e.id, branchId: input.branch_id, ip, metadata: { title: input.title, amount: input.amount, status } });
  return e;
}

/** Edit an expense while it is still draft (or rejected, before resubmit). */
export async function updateExpense(scope: AccessScope, id: string, input: {
  fund_id?: string; category_id?: string; title?: string; description?: string; amount?: number;
  expense_date?: string; vendor?: string; method?: string; reference?: string;
}, ip?: string) {
  if (!hasPermission(scope, 'expenses.create') && !scope.isSuper) throw ApiError.forbidden();
  const e = await getExpense(scope, id);
  if (!['draft', 'rejected'].includes(e.status)) throw ApiError.conflict('Only draft or rejected expenses can be edited.');
  if (scope.branchIds && !scope.branchIds.includes(e.branch_id)) throw ApiError.forbidden();
  const updated = await queryOne<any>(
    `UPDATE expenses SET fund_id = COALESCE($2, fund_id), category_id = COALESCE($3, category_id),
       title = COALESCE($4, title), description = COALESCE($5, description),
       amount = COALESCE($6, amount), expense_date = COALESCE($7, expense_date),
       vendor = COALESCE($8, vendor), method = COALESCE($9, method), reference = COALESCE($10, reference)
     WHERE id = $1 RETURNING *`,
    [id, input.fund_id ?? null, input.category_id ?? null, input.title ?? null, input.description ?? null,
     input.amount ?? null, input.expense_date ?? null, input.vendor ?? null, input.method ?? null, input.reference ?? null],
  );
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'expense.update', entity: 'expense', entityId: id, ip, metadata: { fields: Object.keys(input) } });
  return updated;
}

export async function submitExpense(scope: AccessScope, id: string, ip?: string) {
  const e = await getExpense(scope, id);
  if (e.status !== 'draft' && e.status !== 'rejected') throw ApiError.conflict('Only draft or rejected expenses can be submitted.');
  if (scope.branchIds && !scope.branchIds.includes(e.branch_id)) throw ApiError.forbidden();
  const updated = await queryOne<any>('UPDATE expenses SET status = \'submitted\', submitted_by = $2, rejected_reason = NULL WHERE id = $1 RETURNING *', [id, scope.userId]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'expense.submit', entity: 'expense', entityId: id, ip });
  // Notify approvers
  const approvers = await queryCol<string>(
    `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE r.code IN ('finance','super_admin') AND ur.user_id <> $1`,
    [scope.userId],
  );
  if (approvers.length) {
    const { notifyUsers } = await import('../notify/notifyService');
    await notifyUsers(approvers, { type: 'task_assigned', title: 'Expense awaiting approval', body: `${e.title} — ${e.amount}`, link: '/finance/expenses' }).catch(() => {});
  }
  return updated;
}

export async function decideExpense(scope: AccessScope, id: string, decision: 'approve' | 'reject', reason?: string, ip?: string) {
  if (!hasPermission(scope, 'expenses.approve') && !scope.isSuper) throw ApiError.forbidden();
  const e = await getExpense(scope, id);
  if (e.status !== 'submitted') throw ApiError.conflict('Only submitted expenses can be approved or rejected.');
  if (e.submitted_by === scope.userId) throw ApiError.forbidden('You cannot approve an expense you submitted.');
  const updated = decision === 'approve'
    ? await queryOne<any>('UPDATE expenses SET status = \'approved\', approved_by = $2, approved_at = now() WHERE id = $1 RETURNING *', [id, scope.userId])
    : await queryOne<any>("UPDATE expenses SET status = 'rejected', approved_by = $2, approved_at = now(), rejected_reason = $3 WHERE id = $1 RETURNING *", [id, scope.userId, reason ?? null]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: decision === 'approve' ? 'expense.approve' : 'expense.reject', entity: 'expense', entityId: id, ip, metadata: { reason } });
  return updated;
}

export async function markPaid(scope: AccessScope, id: string, paidAt: string, ip?: string) {
  if (!hasPermission(scope, 'expenses.approve') && !scope.isSuper) throw ApiError.forbidden();
  const e = await getExpense(scope, id);
  if (e.status !== 'approved') throw ApiError.conflict('Only approved expenses can be marked as paid.');
  const updated = await queryOne<any>('UPDATE expenses SET status = \'paid\', paid_at = $2::timestamptz, paid_by = $3 WHERE id = $1 RETURNING *', [id, paidAt, scope.userId]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'expense.pay', entity: 'expense', entityId: id, ip, metadata: { paid_at: paidAt } });
  return updated;
}

export async function archiveExpense(scope: AccessScope, id: string, ip?: string) {
  if (!hasPermission(scope, 'expenses.create') && !scope.isSuper) throw ApiError.forbidden();
  const e = await getExpense(scope, id);
  if (e.status === 'paid') throw ApiError.conflict('Paid expenses are part of the financial record and cannot be deleted.');
  await query('UPDATE expenses SET deleted_at = now() WHERE id = $1', [id]);
  await audit({ userId: scope.userId, orgId: scope.orgId, action: 'expense.delete', entity: 'expense', entityId: id, ip, metadata: { soft: true, status: e.status } });
  return { id };
}

/* ─────────────────────────── Expense stats ─────────────────────────── */

export async function expenseTrend(scope: AccessScope, months = 6) {
  const [sw, sp] = branchScopeWhere(scope, 'e.branch_id');
  return query<any>(
    `SELECT to_char(e.expense_date, 'YYYY-MM') AS month,
            COALESCE(SUM(e.amount) FILTER (WHERE e.status IN ('approved','paid')), 0) AS total
       FROM expenses e
      WHERE e.expense_date >= date_trunc('month', current_date) - (${months - 1}) * interval '1 month'${sw}
      GROUP BY 1 ORDER BY 1`,
    sp,
  );
}

export async function expenseSummary(scope: AccessScope) {
  const [sw, sp] = branchScopeWhere(scope, 'e.branch_id');
  const row = await queryOne<any>(
    `SELECT COALESCE(SUM(e.amount) FILTER (WHERE e.status IN ('approved','paid') AND e.expense_date >= date_trunc('month', current_date)),0) AS this_month,
            (COUNT(*) FILTER (WHERE e.status = 'submitted'))::int AS awaiting_approval
       FROM expenses e WHERE ${'1=1'}${sw}`,
    sp,
  );
  return { thisMonth: Number(row.this_month).toFixed(2), awaitingApproval: row.awaiting_approval };
}
