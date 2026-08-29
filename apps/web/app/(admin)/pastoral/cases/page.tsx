'use client';

import Link from 'next/link';
import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Button, Field, Input, PageHeader, Select, useMe } from '@/components/ui/primitives';
import { fmtDate } from '@/lib/client';

export default function CasesPage() {
  const { has } = useMe();
  const list = useList('/api/v1/pastoral/cases');
  const p = list.params;

  const columns = [
    {
      key: 'title', label: 'Case', sortable: true,
      render: (r: any) => <Link href={`/pastoral/cases/${r.id}`} className="font-medium text-primary-700 hover:underline">{r.title}</Link>,
    },
    { key: 'type', label: 'Type', render: (r: any) => <span className="capitalize">{r.type}</span> },
    { key: 'member_name', label: 'Member', render: (r: any) => r.member_name ?? '—' },
    { key: 'priority', label: 'Priority', render: (r: any) => <Badge color={r.priority ?? 'normal'}>{r.priority ?? 'normal'}</Badge> },
    { key: 'assigned_to_name', label: 'Assigned', render: (r: any) => r.assigned_to_name ?? 'Unassigned' },
    { key: 'opened_at', label: 'Opened', sortable: true, render: (r: any) => fmtDate(r.opened_at) },
    { key: 'status', label: 'Status', render: (r: any) => <Badge color={r.status}>{r.status}</Badge> },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Pastoral cases" description="Sensitive. Visible only to pastoral-care roles."
        crumbs={[{ label: 'Pastoral care' }, { label: 'Cases' }]} />
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Status">
          <Select value={p.status ?? ''} className="w-44" onChange={(e) => list.setParam({ status: e.target.value })}>
            <option value="">All</option><option value="open">Open</option><option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option><option value="closed">Closed</option>
          </Select>
        </Field>
      </div>
      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        onRowClick={(r: any) => (window.location.href = `/pastoral/cases/${r.id}`)}
        emptyTitle="No pastoral cases" emptyMessage="Open a case when a member needs pastoral support."
      />
    </div>
  );
}
