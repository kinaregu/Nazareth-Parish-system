'use client';

import Link from 'next/link';
import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Button, Field, Select, PageHeader, useMe } from '@/components/ui/primitives';
import { fmtDate } from '@/lib/client';

function audienceLabel(a: any) {
  if (!a) return 'All';
  switch (a.type) {
    case 'all': return 'Everyone';
    case 'branch': return 'Branch';
    case 'ministry': return 'Ministry';
    case 'department': return 'Department';
    case 'group': return 'Group';
    case 'members': return `${a.member_ids?.length ?? 0} selected members`;
    case 'role': return `Role: ${a.role}`;
    default: return 'All';
  }
}

export default function AnnouncementsPage() {
  const { has } = useMe();
  const list = useList('/api/v1/announcements');
  const p = list.params;

  const columns = [
    { key: 'title', label: 'Title', sortable: true, render: (r: any) => <span className="font-medium text-slate-800">{r.title}</span> },
    { key: 'audience', label: 'Audience', render: (r: any) => <span className="text-xs text-slate-500">{audienceLabel(r.audience)}</span> },
    { key: 'published_at', label: 'Published', sortable: true, render: (r: any) => fmtDate(r.published_at ?? r.publish_at) },
    { key: 'expires_at', label: 'Expires', render: (r: any) => (r.expires_at ? fmtDate(r.expires_at) : '—') },
    {
      key: 'status', label: 'Status', render: (r: any) => (
        <Badge color={r.status === 'published' && r.expires_at && new Date(r.expires_at) < new Date() ? 'expired' : r.status}>
          {r.status === 'published' && r.expires_at && new Date(r.expires_at) < new Date() ? 'expired' : r.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Announcements" description="Draft → scheduled → published → expired, with audience targeting"
        actions={has('announcements.manage') ? <Link href="/announcements/new"><Button>+ New announcement</Button></Link> : undefined} />
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Status">
          <Select value={p.status ?? ''} className="w-40" onChange={(e) => list.setParam({ status: e.target.value })}>
            <option value="">All</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option>
            <option value="published">Published</option><option value="expired">Expired</option>
          </Select>
        </Field>
      </div>
      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        emptyTitle="No announcements" emptyMessage="Publish your first announcement to the congregation."
      />
    </div>
  );
}
