'use client';

import Link from 'next/link';
import { DataTable, useList } from '@/components/ui/data-table';
import { Button, Field, Input, PageHeader, useMe } from '@/components/ui/primitives';

export default function FamiliesPage() {
  const { has } = useMe();
  const list = useList('/api/v1/families');

  const columns = [
    {
      key: 'name', label: 'Family', sortable: true,
      render: (r: any) => <Link href={`/families/${r.id}`} className="font-medium text-primary-700 hover:underline">{r.name}</Link>,
    },
    { key: 'head_name', label: 'Head', render: (r: any) => r.head_name ?? '—' },
    { key: 'members_count', label: 'Members', render: (r: any) => r.members_count ?? 0 },
    { key: 'address', label: 'Address', render: (r: any) => r.address ?? '—' },
    { key: 'phone', label: 'Phone', render: (r: any) => r.phone ?? '—' },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Families" description={list.meta ? `${list.meta.total} families` : 'Household records'}
        actions={has('families.create') ? <Link href="/families/new"><Button>+ New family</Button></Link> : undefined} />
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Search">
          <Input placeholder="Family name, head, address…" defaultValue={list.params.search ?? ''} onChange={(e) => list.setParam({ search: e.target.value })} />
        </Field>
      </div>
      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        onRowClick={(r: any) => (window.location.href = `/families/${r.id}`)}
        emptyTitle="No families yet" emptyMessage="Create a family and link members to it."
      />
    </div>
  );
}
