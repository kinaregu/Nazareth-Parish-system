'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, ConfirmDialog, Field, Input, PageHeader, Select, Skeleton, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function EventDetailPage({ params }: { params: { id: string } }) {
  const { has } = useMe();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'complete' | 'publish'; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<any>(null);

  const load = useCallback(() => {
    api(`/api/v1/events/${params.id}`).then((r: any) => setD(r.data)).catch((e: any) => setErr(e.message));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status: string) => {
    setBusy(true);
    try {
      await api(`/api/v1/events/${d.event.id}`, { method: 'PUT', body: { status } });
      toast.success(`Event ${status}.`);
      setConfirm(null);
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const setRegStatus = async (regId: string, status: string) => {
    try {
      await api(`/api/v1/events/${d.event.id}/registrations/${regId}`, { method: 'PUT', body: { status } });
      load();
    } catch (e: any) { toast.error(errMessage(e)); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api(`/api/v1/events/${d.event.id}`, {
        method: 'PUT',
        body: {
          title: edit.title, location: edit.location || undefined, description: edit.description || undefined,
          ends_at: edit.ends_at ? new Date(edit.ends_at).toISOString() : undefined,
        },
      });
      toast.success('Event updated.');
      setEdit(null);
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!d) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-80" /><Skeleton className="h-72" /></div>;

  const e = d.event;
  const regs: any[] = d.registrations ?? [];
  const canManage = has('events.manage');
  const counts: Record<string, number> = {};
  regs.forEach((r) => { counts[r.status] = (counts[r.status] ?? 0) + 1; });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title={e.title}
        description={`${fmtDate(e.starts_at, 'long')}${e.location ? ` · ${e.location}` : ''} · ${e.branch_name ?? ''}`}
        crumbs={[{ label: 'Events', href: '/events' }, { label: e.title }]}
        actions={
          <>
            <Badge color={e.status}>{e.status}</Badge>
            {canManage && e.status === 'draft' && <Button size="sm" onClick={() => setConfirm({ kind: 'publish', label: 'Publish' })}>Publish & announce</Button>}
            {canManage && e.status === 'published' && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEdit({ title: e.title, location: e.location ?? '', description: e.description ?? '', ends_at: '' })}>Edit</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'complete', label: 'Mark completed' })}>Complete</Button>
                <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: 'cancel', label: 'Cancel event' })}>Cancel</Button>
              </>
            )}
          </>
        }
      />

      {e.description && <Card title="Description"><p className="whitespace-pre-wrap text-sm text-slate-700">{e.description}</p></Card>}

      <Card title={`Registrations (${regs.length}${e.capacity ? ` / capacity ${e.capacity}` : ''})`}>
        <div className="mb-3 flex flex-wrap gap-2">
          {(['registered', 'attended', 'absent', 'cancelled'] as const).map((s) => counts[s] ? <Badge key={s} color={s}>{s}: {counts[s]}</Badge> : null)}
        </div>
        {regs.length === 0 ? <p className="text-sm text-slate-500">No registrations yet. Members can register from the portal when the event is published.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left"><th className="th">Member</th><th className="th">Registered</th><th className="th">Status</th>{canManage && <th className="th text-right">Update</th>}</tr></thead>
            <tbody>
              {regs.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="td">
                    {r.member_pk ? (
                      <Link href={`/members/${r.member_pk}`} className="text-primary-700 hover:underline">{r.first_name} {r.last_name}</Link>
                    ) : <span>{r.user_name ?? 'Member'}</span>}
                  </td>
                  <td className="td">{fmtDate(r.created_at)}</td>
                  <td className="td"><Badge color={r.status}>{r.status}</Badge></td>
                  {canManage && (
                    <td className="td text-right">
                      <select className="input !w-auto !py-1 text-xs" value={r.status} onChange={(ev) => setRegStatus(r.id, ev.target.value)}>
                        {['registered', 'attended', 'absent', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && setStatus(confirm.kind === 'publish' ? 'published' : confirm.kind === 'complete' ? 'completed' : 'cancelled')}
        title={confirm?.label ?? ''}
        message={
          confirm?.kind === 'publish' ? 'Publishing sends a notification to every eligible member.'
            : confirm?.kind === 'complete' ? 'Mark this event as completed? Registration closes and it moves to history.'
              : 'Cancel this event? Registered members are notified.'
        }
        confirmLabel={confirm?.label}
        danger={confirm?.kind === 'cancel'}
      />

      {edit && (
        <Card title="Edit event">
          <div className="space-y-4">
            <Field label="Title"><Input value={edit.title} onChange={(ev) => setEdit((p: any) => ({ ...p, title: ev.target.value }))} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location"><Input value={edit.location} onChange={(ev) => setEdit((p: any) => ({ ...p, location: ev.target.value }))} /></Field>
              <Field label="Ends (optional)"><Input type="datetime-local" value={edit.ends_at} onChange={(ev) => setEdit((p: any) => ({ ...p, ends_at: ev.target.value }))} /></Field>
            </div>
            <Field label="Description"><Input value={edit.description} onChange={(ev) => setEdit((p: any) => ({ ...p, description: ev.target.value }))} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
