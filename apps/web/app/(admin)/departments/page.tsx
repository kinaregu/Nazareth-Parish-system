'use client';

import Link from 'next/link';
import { DataTable, useList } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/primitives';

export default function DepartmentsPage() {
  const list = useList('/api/v1/departments');

  const columns = [
    {
      key: 'name', label: 'Department', sortable: true,
      render: (r: any) => <Link href={`/departments/${r.id}`} className="font-medium text-primary-700 hover:underline">{r.name}</Link>,
    },
    { key: 'leader_name', label: 'Head', render: (r: any) => r.leader_name ?? '—' },
    { key: 'ministry_name', label: 'Under ministry', render: (r: any) => r.ministry_name ?? '—' },
    { key: 'members_count', label: 'Members', render: (r: any) => r.members_count ?? 0 },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Departments" description={list.meta ? `${list.meta.total} departments` : 'Functional departments of the church'} />
      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        onRowClick={(r: any) => (window.location.href = `/departments/${r.id}`)}
        emptyTitle="No departments yet"
      />
    </div>
  );
}
