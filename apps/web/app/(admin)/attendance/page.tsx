'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, useList } from '@/components/ui/data-table';
import { Button, Field, Input, PageHeader, Select, useMe } from '@/components/ui/primitives';
import { api, fmtDate } from '@/lib/client';

export default function AttendancePage() {
  const { has } = useMe();
  const list = useList('/api/v1/attendance/sessions');
  const p = list.params;
  const [services, setServices] = useState<any[]>([]);
  useEffect(() => { api('/api/v1/attendance/services').then((r: any) => setServices(r.data ?? [])).catch(() => {}); }, []);

  const columns = [
    { key: 'session_date', label: 'Date', sortable: true, render: (r: any) => fmtDate(r.session_date) },
    { key: 'service_name', label: 'Service', render: (r: any) => r.service_name ?? '—' },
    { key: 'branch_name', label: 'Branch', render: (r: any) => r.branch_name ?? '—' },
    { key: 'present', label: 'Present', render: (r: any) => <span className="font-medium text-emerald-700">{r.present_count ?? 0}</span> },
    { key: 'absent', label: 'Absent', render: (r: any) => <span className="text-red-600">{r.absent_count ?? 0}</span> },
    { key: 'recorded_by_name', label: 'Recorded by', render: (r: any) => r.recorded_by_name ?? '—' },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Attendance sessions" description={list.meta ? `${list.meta.total} sessions` : 'Weekly and special service sessions'}
        actions={has('attendance.manage') ? <Link href="/attendance/new"><Button>+ Record attendance</Button></Link> : undefined} />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Service">
          <Select value={p.service_id ?? ''} className="w-52" onChange={(e) => list.setParam({ service_id: e.target.value })}>
            <option value="">All services</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="From"><Input type="date" defaultValue={p.from ?? ''} onChange={(e) => list.setParam({ from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" defaultValue={p.to ?? ''} onChange={(e) => list.setParam({ to: e.target.value })} /></Field>
      </div>

      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        onRowClick={(r: any) => (window.location.href = `/attendance/${r.id}`)}
        emptyTitle="No sessions yet" emptyMessage="Record attendance for a service to get started."
      />
    </div>
  );
}
