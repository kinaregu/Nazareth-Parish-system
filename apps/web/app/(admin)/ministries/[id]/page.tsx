'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Skeleton, useMe } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

const ROLES = ['leader', 'assistant', 'member'];

export default function MinistryDetailPage({ params }: { params: { id: string } }) {
  const { has } = useMe();
  const [m, setM] = useState<any>(null);
  const [memberOpts, setMemberOpts] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [add, setAdd] = useState<any>({ member_id: '', role: 'member' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`/api/v1/ministries/${params.id}`).then((r: any) => { setM(r.data); setRoster(r.data?.members ?? null); }).catch(() => setM({}));
  }, [params.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api('/api/v1/members?status=active&pageSize=500&sort=first_name').then((r: any) => setMemberOpts(r.data ?? [])).catch(() => {});
  }, []);

  const setRosterRole = async (memberId: string, role: string, active: boolean) => {
    if (!roster) return;
    const entries = roster.map((x) => ({ member_id: x.id, role: x.role ?? 'member', active: x.is_active ?? true }))
      .map((x) => (x.member_id === memberId ? { ...x, role, active } : x));
    setBusy(true);
    try {
      await api(`/api/v1/ministries/${m.id}`, { method: 'POST', body: { entries } });
      load();
      toast.success('Roster updated.');
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const removeMember = async (memberId: string) => {
    if (!roster) return;
    const entries = roster.filter((x) => x.id !== memberId).map((x) => ({ member_id: x.id, role: x.role ?? 'member', active: true }));
    setBusy(true);
    try {
      await api(`/api/v1/ministries/${m.id}`, { method: 'POST', body: { entries } });
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const addMember = async () => {
    if (!add.member_id || !roster) return;
    const entries = [...roster.map((x) => ({ member_id: x.id, role: x.role ?? 'member', active: true })), { member_id: add.member_id, role: add.role, active: true }];
    setBusy(true);
    try {
      await api(`/api/v1/ministries/${m.id}`, { method: 'POST', body: { entries } });
      setAddOpen(false); setAdd({ member_id: '', role: 'member' });
      load();
      toast.success('Member added.');
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  if (!m) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;
  if (!m.id) return <div className="p-6 text-sm text-red-600">Ministry not found.</div>;

  const canManage = has('ministries.manage');
  const current = roster ?? [];
  const addable = memberOpts.filter((x) => !current.some((c) => c.id === x.id));

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title={m.name} description={m.description ?? 'Ministry'}
        crumbs={[{ label: 'Ministries', href: '/ministries' }, { label: m.name }]} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details">
          <dl className="space-y-2 text-sm">
            {[['Leader', m.leader_name], ['Meets', m.meeting_day ? `${m.meeting_day}${m.meeting_time ? ` ${m.meeting_time}` : ''}` : '—'],
              ['Location', m.location], ['Branch', m.branch_name]].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-slate-800">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="lg:col-span-2" title={`Membership (${current.length})`}
          actions={canManage ? <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>+ Add member</Button> : undefined}>
          {current.length === 0 ? <p className="text-sm text-slate-500">No members in this ministry yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {current.map((x: any) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/members/${x.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {x.first_name} {x.last_name}
                  </Link>
                  <div className="flex items-center gap-2">
                    {canManage ? (
                      <>
                        <select className="input !w-auto !py-1 text-xs" value={x.role ?? 'member'} disabled={busy}
                          onChange={(e) => setRosterRole(x.id, e.target.value, x.is_active ?? true)}>
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button className="text-xs text-red-500 hover:underline" onClick={() => removeMember(x.id)}>remove</button>
                      </>
                    ) : <Badge color="none">{x.role ?? 'member'}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add member to ministry">
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
            <Button onClick={addMember} disabled={busy || !add.member_id}>{busy ? 'Adding…' : 'Add'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
