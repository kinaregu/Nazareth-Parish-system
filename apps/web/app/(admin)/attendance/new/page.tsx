'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Card, Field, Input, PageHeader, Select, Textarea, useMe } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

/**
 * Record attendance: pick a service + date → creates/loads the session →
 * mark each visible member present / absent / excused.
 */
export default function RecordAttendancePage() {
  const router = useRouter();
  const { me } = useMe();
  const [services, setServices] = useState<any[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [session, setSession] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api('/api/v1/attendance/services').then((r: any) => {
      const d = r.data ?? [];
      setServices(d);
      if (d.length === 1) setServiceId(d[0].id);
    }).catch(() => {});
  }, []);

  const loadMembers = async (sid: string) => {
    // active members (scoped by the API); search-filtered client-side
    const r = await api('/api/v1/members?status=active&pageSize=1000&sort=first_name');
    setMembers(r.data ?? []);
  };

  const start = async () => {
    if (!serviceId) { toast.error('Choose a service.'); return; }
    setBusy(true);
    try {
      let s: any = null;
      try {
        // look for an existing session for service+date
        const r = await api(`/api/v1/attendance/sessions?service_id=${serviceId}&from=${date}&to=${date}`);
        s = (r.data ?? [])[0] ?? null;
      } catch { /* ignore */ }
      if (!s) {
        const created = await api('/api/v1/attendance/sessions', { method: 'POST', body: { service_id: serviceId, session_date: date, note: note || undefined } });
        s = created.data;
        toast.success('Session created.');
      }
      setSession(s);
      setMarks({});
      setLoaded(true);
      await loadMembers(serviceId);
    } catch (e: any) {
      toast.error(errMessage(e, 'Could not create the session.'));
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    if (!filter) return members;
    const f = filter.toLowerCase();
    return members.filter((m: any) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(f));
  }, [members, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { present: 0, absent: 0, excused: 0 };
    Object.values(marks).forEach((v) => { if (c[v] !== undefined) c[v]++; });
    return c;
  }, [marks]);

  const save = async () => {
    if (!session) return;
    const entries = Object.entries(marks).map(([member_id, status]) => ({ member_id, status }));
    setBusy(true);
    try {
      const r = await api(`/api/v1/attendance/sessions/${session.id}`, { method: 'PUT', body: { entries } });
      toast.success(`Attendance saved — ${entries.length} entries.`);
      router.push(`/attendance/${session.id}`);
    } catch (e: any) {
      toast.error(errMessage(e, 'Could not save attendance.'));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <PageHeader title="Record attendance" description="Pick a service and date. Existing sessions load in place of a duplicate."
          crumbs={[{ label: 'Attendance', href: '/attendance' }, { label: 'Record' }]} />
        <Card title="Session">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Service" required>
              <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Select…</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Easter special" /></Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Link href="/attendance"><Button variant="secondary">Cancel</Button></Link>
            <Button onClick={start} disabled={busy || !serviceId}>{busy ? 'Loading…' : 'Start recording'}</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title={`Recording — ${session?.service_name ?? 'service'}`}
        description={`${new Date(session?.session_date).toLocaleDateString('en-GB')} · ${members.length} active members in view`}
        crumbs={[{ label: 'Attendance', href: '/attendance' }, { label: 'Record' }]}
        actions={
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : `Save (${counts.present} present / ${counts.absent} absent / ${counts.excused} excused)`}
          </Button>
        }
      />

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <Input placeholder="Filter by name…" value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-64" />
        <p className="text-xs text-slate-400">Only members you can see are listed. Unmarked members are not saved.</p>
      </div>

      <div className="card divide-y divide-slate-100">
        {filtered.slice(0, 400).map((m: any) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">
                {m.first_name} {m.middle_name ? `${m.middle_name[0]}. ` : ''}{m.last_name}
                <span className="ml-2 font-mono text-xs text-slate-400">{m.member_no}</span>
              </p>
            </div>
            <div className="flex gap-1">
              {([['present', 'Present', 'emerald'], ['absent', 'Absent', 'red'], ['excused', 'Excused', 'amber']] as const).map(([v, label, color]) => (
                <button
                  key={v}
                  onClick={() => setMarks((prev) => ({ ...prev, [m.id]: prev[m.id] === v ? undefined as any : v }))}
                  aria-pressed={marks[m.id] === v}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    marks[m.id] === v
                      ? color === 'emerald' ? 'border-emerald-500 bg-emerald-500 text-white'
                        : color === 'red' ? 'border-red-500 bg-red-500 text-white'
                        : 'border-amber-500 bg-amber-500 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No active members match.</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/attendance"><Button variant="secondary">Discard</Button></Link>
        <Button onClick={save} disabled={busy || Object.keys(marks).length === 0}>{busy ? 'Saving…' : `Save attendance (${Object.keys(marks).length})`}</Button>
      </div>
    </div>
  );
}
