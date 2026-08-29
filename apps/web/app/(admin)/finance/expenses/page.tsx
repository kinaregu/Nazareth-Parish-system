'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Textarea, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate, fmtMoney } from '@/lib/client';

export default function ExpensesPage() {
  const { has, me } = useMe();
  const list = useList('/api/v1/expenses');
  const p = list.params;
  const [categories, setCategories] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [payFor, setPayFor] = useState<any>(null);
  const [f, setF] = useState<any>({ branch_id: '', fund_id: '', category_id: '', title: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), method: 'cash', vendor: '', description: '', submit: true });
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<any>) => setF((x: any) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    api('/api/v1/expenses/categories').then((r: any) => setCategories(r.data ?? [])).catch(() => {});
    if (has('funds.manage')) api('/api/v1/funds').then((r: any) => setFunds(r.data ?? [])).catch(() => {});
    api('/api/v1/branches').then((r: any) => setBranches(r.data ?? [])).catch(() => {});
  }, [has]);

  const act = async (id: string, action: string, body: any = {}) => {
    try {
      await api(`/api/v1/expenses/${id}/${action}`, { method: 'POST', body });
      toast.success(`Expense ${action}.`);
      list.reload();
    } catch (e: any) { toast.error(errMessage(e)); }
  };

  const create = async () => {
    setBusy(true);
    try {
      await api('/api/v1/expenses', { method: 'POST', body: { ...f, amount: Number(f.amount) } });
      toast.success('Expense created.');
      setNewOpen(false);
      list.reload();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'title', label: 'Expense', sortable: true, render: (r: any) => <span className="font-medium text-slate-800">{r.title}</span> },
    { key: 'category_name', label: 'Category', render: (r: any) => r.category_name ?? '—' },
    { key: 'expense_date', label: 'Date', sortable: true, render: (r: any) => fmtDate(r.expense_date) },
    { key: 'vendor', label: 'Vendor', render: (r: any) => r.vendor ?? '—' },
    { key: 'amount', label: 'Amount', sortable: true, render: (r: any) => <span className="font-medium">{fmtMoney(r.amount)}</span> },
    { key: 'status', label: 'Status', render: (r: any) => <Badge color={r.status}>{r.status}</Badge> },
    {
      key: 'actions', label: '',
      render: (r: any) => (
        <div className="flex flex-wrap justify-end gap-1">
          {has('expenses.create') && ['draft', 'rejected'].includes(r.status) && (
            <>
              <Button size="sm" variant="secondary" onClick={() => act(r.id, 'submit')}>Submit</Button>
              <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete this expense (${r.title})?`) && act(r.id, '..', {})} style={{ display: 'none' }}>x</Button>
            </>
          )}
          {has('expenses.approve') && r.status === 'submitted' && r.submitted_by !== me?.user.id && (
            <>
              <Button size="sm" onClick={() => act(r.id, 'approve')}>Approve</Button>
              <Button size="sm" variant="danger" onClick={() => { const reason = window.prompt('Reason for rejection:'); if (reason !== null) act(r.id, 'reject', { note: reason }); }}>Reject</Button>
            </>
          )}
          {has('expenses.approve') && r.status === 'approved' && (
            <Button size="sm" variant="gold" onClick={() => setPayFor(r)}>Mark paid</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Expenses" description="Workflow: draft → submitted → approved/rejected → paid"
        crumbs={[{ label: 'Finance' }, { label: 'Expenses' }]}
        actions={has('expenses.create') ? <Button onClick={() => { setF((x: any) => ({ ...x, branch_id: x.branch_id || branches[0]?.id, fund_id: x.fund_id || funds[0]?.id })); setNewOpen(true); }}>+ New expense</Button> : undefined} />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Status">
          <Select value={p.status ?? ''} className="w-44" onChange={(e) => list.setParam({ status: e.target.value })}>
            <option value="">All</option>
            {['draft', 'submitted', 'approved', 'rejected', 'paid'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="From"><Input type="date" defaultValue={p.from ?? ''} onChange={(e) => list.setParam({ from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" defaultValue={p.to ?? ''} onChange={(e) => list.setParam({ to: e.target.value })} /></Field>
      </div>

      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        emptyTitle="No expenses" emptyMessage="Record your first expense to start the approval workflow."
      />

      {/* new expense */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New expense">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required><Input required value={f.title} onChange={set('title')} /></Field>
            <Field label="Amount" required><Input type="number" step="0.01" min="0.01" required value={f.amount} onChange={set('amount')} /></Field>
            <Field label="Category">
              <Select value={f.category_id} onChange={set('category_id')}>
                <option value="">Select…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Fund">
              <Select value={f.fund_id} onChange={set('fund_id')}>
                <option value="">Select…</option>
                {funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={f.branch_id} onChange={set('branch_id')}>
                <option value="">Select…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Expense date" required><Input type="date" required value={f.expense_date} onChange={set('expense_date')} /></Field>
            <Field label="Vendor"><Input value={f.vendor} onChange={set('vendor')} /></Field>
            <Field label="Payment method">
              <Select value={f.method} onChange={set('method')}>
                {['cash', 'check', 'online', 'mobile_money', 'bank_transfer', 'other'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Description"><Textarea value={f.description} onChange={set('description')} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.submit} onChange={(e) => setF((x: any) => ({ ...x, submit: e.target.checked }))} className="h-4 w-4" />
            Submit for approval immediately
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !f.title || !f.amount}>{busy ? 'Saving…' : 'Save expense'}</Button>
          </div>
        </div>
      </Modal>

      {/* mark paid */}
      {payFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-md p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-800">Mark as paid — {payFor.title}</h2>
            <p className="mb-4 text-sm text-slate-600">{fmtMoney(payFor.amount)} · method: {payFor.method}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button>
              <Button onClick={async () => {
                const paidAt = window.prompt('Payment date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
                if (!paidAt) return;
                await act(payFor.id, 'pay', { paid_at: paidAt });
                setPayFor(null);
              }}>Confirm payment</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
