'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, Input, PageHeader, Skeleton, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const { has } = useMe();
  const [s, setS] = useState<any>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    api(`/api/v1/attendance/sessions/${params.id}`).then((r: any) => setS(r.data)).catch(() => setS({}));
  }, [params.id]);

  const records: any[] = s?.records ?? [];
  const filtered = useMemo(() => {
    if (!filter) return records;
    const f = filter.toLowerCase();
    return records.filter((r) => `${r.first_name} ${r.last_name}`.toLowerCase().includes(f));
  }, [records, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    records.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [records]);

  const saveOverride = async (memberPk: string, status: string) => {
    if (!s) return;
    const next = { ...overrides, [memberPk]: status };
    setOverrides(next);
    setBusy(true);
    try {
      await api(`/api/v1/attendance/sessions/${s.id}`, { method: 'PUT', body: { entries: [{ member_id: memberPk, status }] } });
      const r = await api(`/api/v1/attendance/sessions/${s.id}`);
      setS(r.data);
      toast.success('Attendance updated.');
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-80" /><Skeleton className="h-72" /></div>;
  if (!s.id) return <div className="p-6 text-sm text-red-600">Session not found.</div>;

  const canEdit = has('attendance.manage');

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title={`${s.service_name ?? 'Service'} — ${fmtDate(s.session_date)}`}
        description={`${s.branch_name ?? ''}${s.note ? ` · ${s.note}` : ''} · recorded by ${s.recorded_by_name ?? '—'}`}
        crumbs={[{ label: 'Attendance', href: '/attendance' }, { label: fmtDate(s.session_date) }]}
        actions={canEdit ? <Link href="/attendance/new"><Button size="sm" variant="secondary">Record another</Button></Link> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><p className="text-xs uppercase text-slate-400">Present</p><p className="text-2xl font-semibold text-emerald-600">{counts.present ?? 0}</p></Card>
        <Card><p className="text-xs uppercase text-slate-400">Absent</p><p className="text-2xl font-semibold text-red-600">{counts.absent ?? 0}</p></Card>
        <Card><p className="text-xs uppercase text-slate-400">Excused</p><p className="text-2xl font-semibold text-amber-600">{counts.excused ?? 0}</p></Card>
        <Card><p className="text-xs uppercase text-slate-400">First time / visitors</p><p className="text-2xl font-semibold text-primary-600">{(counts.first_time ?? 0) + (counts.visitor ?? 0)}</p></Card>
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-slate-100 p-3">
          <h2 className="text-sm font-semibold text-slate-800">Records ({records.length})</h2>
          <Input placeholder="Filter by name…" value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-56 !py-1.5 text-xs" />
        </div>
        <div className="scroll-thin max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
              <tr><th className="th">Member</th><th className="th">Status</th>{canEdit && <th className="th text-right">Change</th>}</tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id ?? r.member_pk} className="border-b border-slate-100">
                  <td className="td">
                    <Link href={`/members/${r.member_pk}`} className="text-primary-700 hover:underline">{r.first_name} {r.last_name}</Link>
                    <span className="ml-2 font-mono text-xs text-slate-400">{r.member_no}</span>
                  </td>
                  <td className="td"><Badge color={r.status}>{r.status}</Badge></td>
                  {canEdit && (
                    <td className="td text-right">
                      <select
                        className="input !w-auto !py-1 text-xs"
                        value={overrides[r.member_pk] ?? r.status}
                        disabled={busy}
                        onChange={(e) => saveOverride(r.member_pk, e.target.value)}
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="excused">Excused</option>
                        <option value="first_time">First time</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No attendance recorded for this session yet.</p>}
        </div>
      </div>
    </div>
  );
}
