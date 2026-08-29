'use client';

import Link from 'next/link';
import { DataTable, useList } from '@/components/ui/data-table';
import { Button, Field, Input, PageHeader, useMe } from '@/components/ui/primitives';

export default function MinistriesPage() {
  const { has } = useMe();
  const list = useList('/api/v1/ministries');

  const columns = [
    {
      key: 'name', label: 'Ministry', sortable: true,
      render: (r: any) => <Link href={`/ministries/${r.id}`} className="font-medium text-primary-700 hover:underline">{r.name}</Link>,
    },
    { key: 'leader_name', label: 'Leader', render: (r: any) => r.leader_name ?? '—' },
    { key: 'meeting_day', label: 'Meets', render: (r: any) => (r.meeting_day ? `${r.meeting_day}${r.meeting_time ? ` ${r.meeting_time}` : ''}` : '—') },
    { key: 'location', label: 'Location', render: (r: any) => r.location ?? '—' },
    { key: 'members_count', label: 'Members', render: (r: any) => r.members_count ?? 0 },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Ministries" description={list.meta ? `${list.meta.total} ministries` : 'Church ministries'}
        actions={has('ministries.manage') ? <Link href="/ministries/new"><Button>+ New ministry</Button></Link> : undefined} />
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Search">
          <Input placeholder="Ministry name, leader…" defaultValue={list.params.search ?? ''} onChange={(e) => list.setParam({ search: e.target.value })} />
        </Field>
      </div>
      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        onRowClick={(r: any) => (window.location.href = `/ministries/${r.id}`)}
        emptyTitle="No ministries yet"
      />
    </div>
  );
}
