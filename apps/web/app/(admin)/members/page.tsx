'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, useList } from '@/components/ui/data-table';
import { Button, Badge, Field, Input, Select, PageHeader, useMe } from '@/components/ui/primitives';
import { api, fmtDate } from '@/lib/client';

export default function MembersPage() {
  const { has } = useMe();
  const list = useList('/api/v1/members');
  const p = list.params;
  const [ministries, setMinistries] = useState<any[]>([]);

  useEffect(() => {
    if (has('ministries.view')) api('/api/v1/ministries?pageSize=200').then((r: any) => setMinistries(r.data ?? [])).catch(() => {});
  }, [has]);

  const columns = [
    { key: 'member_no', label: 'No.', sortable: true, render: (r: any) => <span className="font-mono text-xs">{r.member_no}</span> },
    {
      key: 'first_name', label: 'Name', sortable: true,
      render: (r: any) => (
        <Link href={`/members/${r.id}`} className="font-medium text-primary-700 hover:underline">
          {r.first_name} {r.middle_name ? `${r.middle_name[0]}. ` : ''}{r.last_name}
        </Link>
      ),
    },
    { key: 'phone', label: 'Phone', render: (r: any) => r.phone ?? <span className="text-slate-400">—</span> },
    { key: 'email', label: 'Email', render: (r: any) => r.email ?? <span className="text-slate-400">—</span> },
    { key: 'gender', label: 'Gender', render: (r: any) => <span className="capitalize">{r.gender ?? '—'}</span> },
    { key: 'status', label: 'Status', render: (r: any) => <Badge color={r.status}>{r.status}</Badge> },
    { key: 'date_joined', label: 'Joined', sortable: true, render: (r: any) => (r.date_joined ? fmtDate(r.date_joined) : '—') },
  ];

  const exportHref = `/api/v1/members/export?${new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v)))}`;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Members"
        description={list.meta ? `${list.meta.total.toLocaleString()} members` : 'Full member directory'}
        actions={has('members.create') ? <Link href="/members/new"><Button>+ Add member</Button></Link> : undefined}
      />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Search">
          <Input placeholder="Name, phone, email, member no…" defaultValue={p.search ?? ''}
            onChange={(e) => list.setParam({ search: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={p.status ?? ''} className="w-40" onChange={(e) => list.setParam({ status: e.target.value })}>
            <option value="">All</option>
            <option value="active">Active</option><option value="inactive">Inactive</option>
            <option value="transferred">Transferred</option><option value="deceased">Deceased</option><option value="suspended">Suspended</option>
          </Select>
        </Field>
        <Field label="Gender">
          <Select value={p.gender ?? ''} className="w-36" onChange={(e) => list.setParam({ gender: e.target.value })}>
            <option value="">All</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Ministry">
          <Select value={p.ministry_id ?? ''} className="w-48" onChange={(e) => list.setParam({ ministry_id: e.target.value })}>
            <option value="">All</option>
            {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        {has('members.export') && (
          <a href={exportHref}><Button variant="secondary">Export CSV</Button></a>
        )}
      </div>

      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        onRowClick={(r: any) => (window.location.href = `/members/${r.id}`)}
        emptyTitle="No members found" emptyMessage="Try adjusting the filters, or add your first member."
        emptyAction={has('members.create') ? <Link href="/members/new"><Button>+ Add member</Button></Link> : undefined}
      />
    </div>
  );
}
