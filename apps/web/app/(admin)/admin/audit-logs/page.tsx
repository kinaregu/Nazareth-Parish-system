'use client';

import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Field, Input, PageHeader } from '@/components/ui/primitives';
import { fmtDate } from '@/lib/client';

export default function AuditLogsPage() {
  const list = useList('/api/v1/audit-logs');
  const p = list.params;

  const columns = [
    { key: 'created_at', label: 'When', sortable: true, render: (r: any) => <span className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString('en-GB')}</span> },
    { key: 'user_name', label: 'User', render: (r: any) => r.user_name ?? 'system' },
    { key: 'action', label: 'Action', render: (r: any) => <span className="font-mono text-xs">{r.action}</span> },
    { key: 'entity', label: 'Entity', render: (r: any) => <span className="text-xs">{r.entity}</span> },
    {
      key: 'metadata', label: 'Details',
      render: (r: any) => {
        const m = r.metadata ?? {};
        const s = Object.entries(m).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
        return <span className="block max-w-[360px] truncate text-xs text-slate-500" title={s}>{s || '—'}</span>;
      },
    },
    { key: 'ip', label: 'IP', render: (r: any) => <span className="font-mono text-xs text-slate-400">{r.ip ?? '—'}</span> },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Audit logs" description="Every significant action is recorded immutably (user, action, entity, IP, metadata)."
        crumbs={[{ label: 'Administration' }, { label: 'Audit logs' }]} />
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="User"><Input placeholder="name or email…" defaultValue={p.user_id ?? ''} onChange={(e) => list.setParam({ user_id: e.target.value })} className="!w-52" /></Field>
        <Field label="Action contains"><Input placeholder="e.g. giving" defaultValue={p.action ?? ''} onChange={(e) => list.setParam({ action: e.target.value })} className="!w-48" /></Field>
        <Field label="Entity"><Input placeholder="e.g. member" defaultValue={p.entity ?? ''} onChange={(e) => list.setParam({ entity: e.target.value })} className="!w-40" /></Field>
        <Field label="From"><Input type="date" defaultValue={p.from ?? ''} onChange={(e) => list.setParam({ from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" defaultValue={p.to ?? ''} onChange={(e) => list.setParam({ to: e.target.value })} /></Field>
      </div>
      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        emptyTitle="No audit entries" emptyMessage="Actions will appear here as they happen."
      />
    </div>
  );
}
