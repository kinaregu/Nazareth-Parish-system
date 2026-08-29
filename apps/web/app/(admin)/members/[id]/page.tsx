'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea, Tabs, useMe,
} from '@/components/ui/primitives';
import { api, errMessage, fmtDate, fmtMoney } from '@/lib/client';

export default function MemberDetailPage({ params }: { params: { id: string } }) {
  const { has, me } = useMe();
  const [tab, setTab] = useState('profile');
  const [m, setM] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // tab payloads
  const [timeline, setTimeline] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [involvement, setInvolvement] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [giving, setGiving] = useState<any>(null);

  // status change
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('active');
  const [statusReason, setStatusReason] = useState('');
  // edit
  const [editOpen, setEditOpen] = useState(false);
  const [ef, setEf] = useState<any>({});
  // archive
  const [confirmArchive, setConfirmArchive] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api(`/api/v1/members/${params.id}`);
      setM(r.data);
    } catch (e: any) {
      setErr(e.message ?? 'Not found');
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!m) return;
    if (tab === 'timeline' && timeline.length === 0) api(`/api/v1/members/${m.id}/timeline`).then((r: any) => setTimeline(r.data ?? [])).catch(() => {});
    if (tab === 'family' && !family) api(`/api/v1/members/${m.id}/family`).then((r: any) => setFamily(r.data ?? null)).catch(() => {});
    if (tab === 'involvement' && !involvement) api(`/api/v1/members/${m.id}/involvement`).then((r: any) => setInvolvement(r.data ?? null)).catch(() => {});
    if (tab === 'attendance' && !attendance) api(`/api/v1/members/${m.id}/attendance`).then((r: any) => setAttendance(r.data ?? null)).catch(() => {});
    if (tab === 'giving' && giving === null) api(`/api/v1/members/${m.id}/giving?pageSize=10`).then((r: any) => setGiving(r.data)).catch(() => setGiving({ data: [] }));
  }, [tab, m, family, involvement, attendance, giving, timeline.length]);

  const changeStatus = async () => {
    setBusy(true);
    try {
      await api(`/api/v1/members/${m.id}/status`, { method: 'POST', body: { status: newStatus, reason: statusReason || undefined } });
      toast.success('Status updated.');
      setStatusOpen(false);
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const openEdit = () => {
    setEf({
      phone: m.phone ?? '', email: m.email ?? '', address: m.address ?? '', city: m.city ?? '',
      gender: m.gender ?? '', date_of_birth: m.date_of_birth ?? '', family_name: '', notes: m.notes ?? '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api(`/api/v1/members/${m.id}`, { method: 'PUT', body: ef });
      toast.success('Member updated.');
      setEditOpen(false);
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  if (err) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{err}</p>
        <Link href="/members" className="mt-2 inline-block text-sm text-primary-600 hover:underline">← Back to members</Link>
      </div>
    );
  }
  if (!m) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-80" /><Skeleton className="h-64" /></div>;

  const name = `${m.first_name} ${m.middle_name ? `${m.middle_name[0]}. ` : ''}${m.last_name}`;
  const canEdit = has('members.edit');
  const canStatus = has('members.manage_status');
  const canDelete = has('members.delete');
  const canSeeGiving = has('giving.view') || me?.scope.linkedMemberId === m.id;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title={name}
        description={`${m.member_no} · ${m.branch_name ?? ''} ${m.date_joined ? `· joined ${fmtDate(m.date_joined)}` : ''}`}
        crumbs={[{ label: 'Members', href: '/members' }, { label: m.member_no }]}
        actions={
          <>
            <Badge color={m.status}>{m.status}</Badge>
            {canStatus && <Button size="sm" variant="secondary" onClick={() => setStatusOpen(true)}>Change status</Button>}
            {canEdit && <Button size="sm" variant="secondary" onClick={openEdit}>Edit</Button>}
            {canDelete && <Button size="sm" variant="danger" onClick={() => setConfirmArchive(true)}>Archive</Button>}
          </>
        }
      />

      <Tabs
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'family', label: 'Family' },
          { key: 'involvement', label: 'Ministries & groups' },
          { key: 'attendance', label: 'Attendance' },
          ...(canSeeGiving ? [{ key: 'giving', label: 'Giving' }] : []),
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'profile' && (
        <Card title="Contact & details">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Phone', m.phone], ['Email', m.email], ['Gender', m.gender],
              ['Date of birth', m.date_of_birth ? fmtDate(m.date_of_birth) : null],
              ['Address', m.address], ['City', m.city],
              ['Country', m.country], ['Baptism', m.baptism_status],
              ['Member since', m.date_joined ? fmtDate(m.date_joined) : null],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="mt-0.5 text-slate-800 capitalize">{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {m.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{m.notes}</p>}
        </Card>
      )}

      {tab === 'timeline' && (
        <Card title="Status & event history">
          {timeline.length === 0 ? <p className="text-sm text-slate-500">No timeline entries yet.</p> : (
            <ol className="relative ml-3 space-y-4 border-l border-slate-200 pl-5">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-primary-300" aria-hidden />
                  <p className="text-sm font-medium text-slate-800">{t.title ?? t.action}</p>
                  {t.reason && <p className="text-xs text-slate-500">{t.reason}</p>}
                  <p className="text-xs text-slate-400">{fmtDate(t.created_at ?? t.date)}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {tab === 'family' && (
        <Card title="Family">
          {!family ? <p className="text-sm text-slate-500">Loading…</p> :
            family.name ? (
              <div>
                <p className="text-sm font-medium text-slate-800">{family.name}</p>
                <p className="text-xs text-slate-500">Head: {family.head_name ?? '—'}</p>
                <ul className="mt-3 divide-y divide-slate-100">
                  {(family.members ?? []).map((x: any) => (
                    <li key={x.id} className="flex items-center justify-between py-2 text-sm">
                      <Link href={`/members/${x.id}`} className="text-primary-700 hover:underline">{x.first_name} {x.last_name}</Link>
                      <Badge color="none">{x.role ?? 'member'}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-sm text-slate-500">Not linked to a family.</p>}
        </Card>
      )}

      {tab === 'involvement' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Ministries">
            {involvement === null ? <p className="text-sm text-slate-500">Loading…</p> :
              (involvement.ministries ?? []).length === 0 ? <p className="text-sm text-slate-500">No ministry involvement.</p> :
              <ul className="divide-y divide-slate-100">
                {(involvement.ministries ?? []).map((x: any) => (
                  <li key={x.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{x.name}</span>
                    <Badge color="none">{x.role ?? 'member'}</Badge>
                  </li>
                ))}
              </ul>}
          </Card>
          <Card title="Groups / cells">
            {involvement === null ? <p className="text-sm text-slate-500">Loading…</p> :
              (involvement.groups ?? []).length === 0 ? <p className="text-sm text-slate-500">No group involvement.</p> :
              <ul className="divide-y divide-slate-100">
                {(involvement.groups ?? []).map((x: any) => (
                  <li key={x.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{x.name}</span>
                    <Badge color="none">{x.role ?? 'member'}</Badge>
                  </li>
                ))}
              </ul>}
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <Card title="Attendance — last 8 weeks">
          {attendance === null ? <p className="text-sm text-slate-500">Loading…</p> : (
            <div>
              <p className="text-sm text-slate-600">
                Attendance rate (last 8 weeks): <span className="font-semibold text-primary-700">{Math.round(attendance.rate ?? 0)}%</span>
              </p>
              {(attendance.history ?? []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {attendance.history.slice(0, 12).map((h: any) => (
                    <div key={h.id} className={`rounded-lg border px-2 py-1 text-center text-xs ${h.status === 'present' || h.status === 'first_time' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : h.status === 'excused' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                      <p className="font-medium">{String(h.session_date).slice(0, 10)}</p>
                      <p className="capitalize">{h.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === 'giving' && canSeeGiving && (
        <Card title="Giving history (recent)">
          {giving?.data?.length === 0 ? <p className="text-sm text-slate-500">No giving recorded.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left"><th className="th">Date</th><th className="th">Fund</th><th className="th">Method</th><th className="th text-right">Amount</th></tr></thead>
              <tbody>
                {(giving?.data ?? []).map((g: any) => (
                  <tr key={g.id} className="border-b border-slate-100">
                    <td className="td">{fmtDate(g.tx_date)}</td>
                    <td className="td">{g.fund_name}</td>
                    <td className="td capitalize">{g.method}</td>
                    <td className="td text-right font-medium">{fmtMoney(g.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Status modal */}
      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} title="Change member status">
        <div className="space-y-4">
          <Field label="New status">
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
              <option value="transferred">Transferred</option><option value="deceased">Deceased</option><option value="suspended">Suspended</option>
            </Select>
          </Field>
          <Field label="Reason" hint="Recorded on the member's timeline.">
            <Textarea value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Optional reason" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button onClick={changeStatus} disabled={busy}>{busy ? 'Saving…' : 'Update status'}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit member">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone"><Input value={ef.phone ?? ''} onChange={(e) => setEf((p: any) => ({ ...p, phone: e.target.value }))} /></Field>
            <Field label="Email"><Input type="email" value={ef.email ?? ''} onChange={(e) => setEf((p: any) => ({ ...p, email: e.target.value }))} /></Field>
            <Field label="Address"><Input value={ef.address ?? ''} onChange={(e) => setEf((p: any) => ({ ...p, address: e.target.value }))} /></Field>
            <Field label="City"><Input value={ef.city ?? ''} onChange={(e) => setEf((p: any) => ({ ...p, city: e.target.value }))} /></Field>
            <Field label="Gender">
              <Select value={ef.gender ?? ''} onChange={(e) => setEf((p: any) => ({ ...p, gender: e.target.value }))}>
                <option value="">—</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Date of birth"><Input type="date" value={ef.date_of_birth ?? ''} onChange={(e) => setEf((p: any) => ({ ...p, date_of_birth: e.target.value }))} /></Field>
          </div>
          <Field label="Notes"><Textarea value={ef.notes ?? ''} onChange={(e) => setEf((p: any) => ({ ...p, notes: e.target.value }))} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={async () => {
          try {
            await api(`/api/v1/members/${m.id}`, { method: 'DELETE' });
            toast.success('Member archived.');
            window.location.href = '/members';
          } catch (e: any) { toast.error(errMessage(e)); }
        }}
        title="Archive member?"
        message={<>This <strong>soft-deletes</strong> the record (it stays in the database and audit trail). Pastoral and financial history is preserved.</>}
        confirmLabel="Archive"
        danger
      />
    </div>
  );
}
