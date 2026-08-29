'use client';

import Link from 'next/link';
import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Button, Field, Input, Select, PageHeader, useMe } from '@/components/ui/primitives';
import { fmtDate } from '@/lib/client';

export default function VisitorsPage() {
  const { has } = useMe();
  const list = useList('/api/v1/visitors');
  const p = list.params;

  const columns = [
    {
      key: 'first_name', label: 'Name', sortable: true,
      render: (r: any) => <Link href={`/visitors/${r.id}`} className="font-medium text-primary-700 hover:underline">{r.first_name} {r.last_name}</Link>,
    },
    { key: 'phone', label: 'Phone', render: (r: any) => r.phone ?? '—' },
    { key: 'service_name', label: 'Service', render: (r: any) => r.service_name ?? '—' },
    { key: 'visit_date', label: 'First visit', sortable: true, render: (r: any) => fmtDate(r.visit_date) },
    { key: 'followup_status', label: 'Follow-up', render: (r: any) => <Badge color={r.followup_status}>{r.followup_status}</Badge> },
    { key: 'assigned_to_name', label: 'Assigned', render: (r: any) => r.assigned_to_name ?? '—' },
    { key: 'converted_member_id', label: 'Converted', render: (r: any) => (r.converted_member_id ? <Badge color="converted">converted</Badge> : <span className="text-slate-400">—</span>) },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Visitors" description={list.meta ? `${list.meta.total} visitor records` : 'First-time guests and their follow-up journey'}
        actions={has('visitors.create') ? <Link href="/visitors/new"><Button>+ Add visitor</Button></Link> : undefined} />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Search">
          <Input placeholder="Name, phone, email…" defaultValue={p.search ?? ''} onChange={(e) => list.setParam({ search: e.target.value })} />
        </Field>
        <Field label="Follow-up status">
          <Select value={p.status ?? ''} className="w-40" onChange={(e) => list.setParam({ status: e.target.value })}>
            <option value="">All</option><option value="none">None</option><option value="planned">Planned</option>
            <option value="contacted">Contacted</option><option value="converted">Converted</option><option value="declined">Declined</option>
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        onRowClick={(r: any) => (window.location.href = `/visitors/${r.id}`)}
        emptyTitle="No visitors" emptyMessage="Record your first-time guests to begin the follow-up journey."
      />
    </div>
  );
}
