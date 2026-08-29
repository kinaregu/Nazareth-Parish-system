'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, Card, Field, Modal, PageHeader, Select, Skeleton, useMe } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

const ROLES = ['leader', 'assistant', 'member'];

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  const { has } = useMe();
  const [g, setG] = useState<any>(null);
  const [memberOpts, setMemberOpts] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [add, setAdd] = useState<any>({ member_id: '', role: 'member' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`/api/v1/groups/${params.id}`).then((r: any) => setG(r.data)).catch(() => setG({}));
  }, [params.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api('/api/v1/members?status=active&pageSize=500&sort=first_name').then((r: any) => setMemberOpts(r.data ?? [])).catch(() => {});
  }, []);

  const entries = (): { member_id: string; role: string; active: boolean }[] =>
    (g?.members ?? []).map((x: any) => ({ member_id: x.id, role: x.role ?? 'member', active: x.is_active ?? true }));

  const mutate = async (next: any[], msg: string) => {
    setBusy(true);
    try {
      await api(`/api/v1/groups/${g.id}`, { method: 'POST', body: { entries: next } });
      load();
      toast.success(msg);
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  if (!g) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;
  if (!g.id) return <div className="p-6 text-sm text-red-600">Group not found.</div>;

  const canManage = has('groups.manage');
  const current: any[] = g.members ?? [];
  const addable = memberOpts.filter((x: any) => !current.some((c: any) => c.id === x.id));

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title={g.name} description={`${g.type ?? 'cell'}${g.description ? ` · ${g.description}` : ''}`}
        crumbs={[{ label: 'Groups', href: '/groups' }, { label: g.name }]} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details">
          <dl className="space-y-2 text-sm">
            {[['Leader', g.leader_name], ['Assistant', g.assistant_name], ['Meets', g.meeting_day ? `${g.meeting_day}${g.meeting_time ? ` ${g.meeting_time}` : ''}` : '—'],
              ['Location', g.location], ['Branch', g.branch_name]].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-slate-800">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="lg:col-span-2" title={`Members (${current.length})`}
          actions={canManage ? <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>+ Add member</Button> : undefined}>
          {current.length === 0 ? <p className="text-sm text-slate-500">No members yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {current.map((x: any) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/members/${x.id}`} className="text-sm font-medium text-primary-700 hover:underline">{x.first_name} {x.last_name}</Link>
                  <div className="flex items-center gap-2">
                    {canManage ? (
                      <>
                        <select className="input !w-auto !py-1 text-xs" value={x.role ?? 'member'} disabled={busy}
                          onChange={(e) => mutate(entries().map((y) => (y.member_id === x.id ? { ...y, role: e.target.value } : y)), 'Role updated.')}>
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button className="text-xs text-red-500 hover:underline" onClick={() => mutate(entries().filter((y) => y.member_id !== x.id), 'Member removed.')}>remove</button>
                      </>
                    ) : <span className="text-xs text-slate-500">{x.role ?? 'member'}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add member to group">
        <div className="space-y-4">
          <Field label="Member" required>
            <Select value={add.member_id} onChange={(e) => setAdd((p: any) => ({ ...p, member_id: e.target.value }))}>
              <option value="">Select…</option>
              {addable.map((x) => <option key={x.id} value={x.id}>{x.first_name} {x.last_name}</option>)}
            </Select>
          </Field>
          <Field label="Role">
            <Select value={add.role} onChange={(e) => setAdd((p: any) => ({ ...p, role: e.target.value }))}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={busy || !add.member_id}
              onClick={() => { mutate([...entries(), { member_id: add.member_id, role: add.role, active: true }], 'Member added.'); setAddOpen(false); setAdd({ member_id: '', role: 'member' }); }}>
              {busy ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
