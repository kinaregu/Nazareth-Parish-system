'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate, fmtMoney, qs } from '@/lib/client';

export default function GivingPage() {
  const { has } = useMe();
  const list = useList('/api/v1/giving');
  const p = list.params;
  const [funds, setFunds] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [g, setG] = useState<any>({ branch_id: '', fund_id: '', member_id: '', amount: '', tx_date: new Date().toISOString().slice(0, 10), method: 'cash', is_anonymous: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (has('funds.manage')) api('/api/v1/funds').then((r: any) => setFunds(r.data ?? [])).catch(() => {});
    api('/api/v1/members?status=active&pageSize=1000&sort=first_name').then((r: any) => setMembers(r.data ?? [])).catch(() => {});
  }, [has]);

  const set = (k: string) => (e: React.ChangeEvent<any>) => setG((x: any) => ({ ...x, [k]: e.target.value }));

  const add = async () => {
    setBusy(true);
    try {
      const r = await api('/api/v1/giving', {
        method: 'POST',
        body: { ...g, amount: Number(g.amount), member_id: g.member_id || undefined },
      });
      toast.success(r.data.receipt_no ? `Gift recorded. Receipt ${r.data.receipt_no}.` : 'Gift recorded.');
      setAddOpen(false);
      list.reload();
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'tx_date', label: 'Date', sortable: true, render: (r: any) => fmtDate(r.tx_date) },
    { key: 'payer_name', label: 'Payer', render: (r: any) => (r.is_anonymous ? <Badge color="private">anonymous</Badge> : <span>{r.payer_name ?? '—'}</span>) },
    { key: 'fund_name', label: 'Fund', render: (r: any) => r.fund_name ?? '—' },
    { key: 'method', label: 'Method', render: (r: any) => <span className="capitalize">{r.method}</span> },
    { key: 'reference', label: 'Reference', render: (r: any) => r.reference ?? '—' },
    { key: 'receipt_no', label: 'Receipt', render: (r: any) => (r.receipt_no ? <span className="font-mono text-xs">{r.receipt_no}</span> : '—') },
    { key: 'status', label: 'Status', render: (r: any) => <Badge color={r.status}>{r.status}</Badge> },
    {
      key: 'amount', label: 'Amount', sortable: true,
      render: (r: any) => <span className="font-medium">{fmtMoney(r.amount)}</span>,
    },
  ];

  const sum = (list as any).sum;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Giving" description={list.meta ? `${list.meta.total.toLocaleString()} gifts${sum ? ` · total ${fmtMoney(sum)}` : ''}` : 'Tithes, offerings and donations'}
        crumbs={[{ label: 'Finance' }, { label: 'Giving' }]}
        actions={has('giving.create') ? <Button onClick={() => { setG((x: any) => ({ ...x, fund_id: x.fund_id || funds[0]?.id || '' })); setAddOpen(true); }}>+ Record gift</Button> : undefined} />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="From"><Input type="date" defaultValue={p.from ?? ''} onChange={(e) => list.setParam({ from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" defaultValue={p.to ?? ''} onChange={(e) => list.setParam({ to: e.target.value })} /></Field>
        <Field label="Fund">
          <Select value={p.fund_id ?? ''} className="w-44" onChange={(e) => list.setParam({ fund_id: e.target.value })}>
            <option value="">All</option>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        rowActions={(r: any) => !r.is_anonymous && r.receipt_no ? (
          <a href={`/api/v1/giving/${r.id}/receipt`}><Button size="sm" variant="ghost">PDF</Button></a>
        ) : null}
        emptyTitle="No gifts recorded" emptyMessage="Record your first gift to see it here."
      />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Record a gift">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fund" required>
              <Select required value={g.fund_id} onChange={set('fund_id')}>
                <option value="">Select…</option>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
            <Field label="Member (optional)">
              <Select value={g.member_id} onChange={set('member_id')}>
                <option value="">Anonymous / unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
              </Select>
            </Field>
            <Field label="Amount" required><Input type="number" step="0.01" min="0.01" required value={g.amount} onChange={set('amount')} /></Field>
            <Field label="Date" required><Input type="date" required value={g.tx_date} onChange={set('tx_date')} /></Field>
            <Field label="Method">
              <Select value={g.method} onChange={set('method')}>
                {['cash', 'mobile_money', 'bank_transfer', 'check', 'online', 'other'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </Select>
            </Field>
            <Field label="Reference (optional)"><Input value={g.reference ?? ''} onChange={set('reference')} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={g.is_anonymous} onChange={(e) => setG((x: any) => ({ ...x, is_anonymous: e.target.checked }))} className="h-4 w-4" />
            Anonymous gift (no name stored on the record)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={add} disabled={busy || !g.fund_id || !g.amount}>{busy ? 'Recording…' : 'Record gift'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
