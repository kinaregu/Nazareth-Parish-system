'use client';

import Link from 'next/link';
import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Button, Field, Input, PageHeader, Select, useMe } from '@/components/ui/primitives';
import { fmtDate } from '@/lib/client';

export default function EventsPage() {
  const { has } = useMe();
  const list = useList('/api/v1/events');
  const p = list.params;

  const columns = [
    {
      key: 'title', label: 'Event', sortable: true,
      render: (r: any) => <Link href={`/events/${r.id}`} className="font-medium text-primary-700 hover:underline">{r.title}</Link>,
    },
    { key: 'starts_at', label: 'Starts', sortable: true, render: (r: any) => fmtDate(r.starts_at, 'long') },
    { key: 'location', label: 'Location', render: (r: any) => r.location ?? '—' },
    { key: 'ministry_name', label: 'Organizer', render: (r: any) => r.ministry_name ?? r.group_name ?? '—' },
    { key: 'registered', label: 'Registered', render: (r: any) => r.registered ?? 0 },
    { key: 'status', label: 'Status', render: (r: any) => <Badge color={r.status}>{r.status}</Badge> },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Events" description={list.meta ? `${list.meta.total} events` : 'Church events with registration'}
        actions={has('events.manage') ? <Link href="/events/new"><Button>+ New event</Button></Link> : undefined} />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Status">
          <Select value={p.status ?? ''} className="w-40" onChange={(e) => list.setParam({ status: e.target.value })}>
            <option value="">All</option><option value="draft">Draft</option><option value="published">Published</option>
            <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="From"><Input type="date" defaultValue={p.from ?? ''} onChange={(e) => list.setParam({ from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" defaultValue={p.to ?? ''} onChange={(e) => list.setParam({ to: e.target.value })} /></Field>
      </div>

      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        onRowClick={(r: any) => (window.location.href = `/events/${r.id}`)}
        emptyTitle="No events found" emptyMessage="Create an event to start planning."
      />
    </div>
  );
}
