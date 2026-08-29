'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, PageHeader, Select, Skeleton, Textarea, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function CaseDetailPage({ params }: { params: { id: string } }) {
  const { has } = useMe();
  const [c, setC] = useState<any>(null);
  const [note, setNote] = useState('');
  const [sensitive, setSensitive] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`/api/v1/pastoral/cases/${params.id}`).then((r: any) => setC(r.data)).catch(() => setC({}));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const update = async (body: any) => {
    setBusy(true);
    try {
      await api(`/api/v1/pastoral/cases/${c.id}`, { method: 'PUT', body });
      toast.success('Case updated.');
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api(`/api/v1/pastoral/cases/${c.id}/notes`, { method: 'POST', body: { body: note, sensitive } });
      setNote('');
      toast.success('Note added.');
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  if (!c) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-80" /><Skeleton className="h-72" /></div>;
  if (!c.id) return <div className="p-6 text-sm text-red-600">Case not found.</div>;

  const canManage = has('pastoral.manage');

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title={c.title}
        description={`Opened ${fmtDate(c.opened_at)} · ${c.type ?? 'case'}`}
        crumbs={[{ label: 'Pastoral care' }, { label: 'Cases', href: '/pastoral/cases' }, { label: c.title }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={c.status}>{c.status}</Badge>
            {canManage && (
              <Select value={c.status} className="!w-36 !py-1.5 text-xs" onChange={(e) => update({ status: e.target.value })}>
                <option value="open">Open</option><option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option><option value="closed">Closed</option>
              </Select>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Member</dt>
              <dd>
                {c.member_id ? (
                  <Link href={`/members/${c.member_id}`} className="text-primary-700 hover:underline">{c.member_name}</Link>
                ) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Assigned to</dt>
              <dd>{c.assigned_to_name ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Resolution</dt>
              <dd>{c.resolution || '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card className="lg:col-span-2" title="Notes (chronological)">
          <div className="max-h-[360px] space-y-4 overflow-y-auto pr-2">
            {(c.notes ?? []).length === 0 && <p className="text-sm text-slate-500">No notes yet.</p>}
            {(c.notes ?? []).map((n: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{n.created_by_name ?? 'Staff'} {n.sensitive && <Badge color="private">sensitive</Badge>}</span>
                  <span>{fmtDate(n.created_at, 'long')}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
              </div>
            ))}
          </div>
          {canManage && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a care note…" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} className="h-3.5 w-3.5" />
                  Mark as sensitive (hidden from non-pastoral roles)
                </label>
                <Button size="sm" onClick={addNote} disabled={busy || !note.trim()}>{busy ? 'Adding…' : 'Add note'}</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
