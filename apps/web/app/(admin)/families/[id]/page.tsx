'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Skeleton, useMe } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

export default function FamilyDetailPage({ params }: { params: { id: string } }) {
  const { has } = useMe();
  const [f, setF] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [memberOpts, setMemberOpts] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [role, setRole] = useState('other');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/v1/families/${params.id}`).then((r: any) => { setF(r.data); setMembers(r.data?.members ?? []); }).catch(() => setF({}));
  }, [params.id]);

  const loadMemberOpts = async () => {
    const r = await api('/api/v1/members?pageSize=200&sort=first_name');
    setMemberOpts((r.data ?? []).filter((m: any) => !members.some((x) => x.id === m.id)));
  };

  const linkMember = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const all = [...members.map((m) => m.id), selected];
      const roles: Record<string, string> = {};
      members.forEach((m) => { roles[m.id] = m.role ?? 'other'; });
      roles[selected] = role;
      await api(`/api/v1/families/${params.id}`, { method: 'PUT', body: { member_ids: all, member_roles: roles } });
      toast.success('Member linked.');
      setLinkOpen(false);
      const r = await api(`/api/v1/families/${params.id}`);
      setF(r.data); setMembers(r.data?.members ?? []);
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  if (!f) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-48" /></div>;
  if (!f.name) return <div className="p-6 text-sm text-red-600">Family not found.</div>;

  const unlink = async (memberId: string) => {
    try {
      const rest = members.filter((m) => m.id !== memberId);
      await api(`/api/v1/families/${params.id}`, { method: 'PUT', body: { member_ids: rest.map((m) => m.id), member_roles: {} } });
      const r = await api(`/api/v1/families/${params.id}`);
      setF(r.data); setMembers(r.data?.members ?? []);
      toast.success('Member unlinked.');
    } catch (e: any) { toast.error(errMessage(e)); }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title={f.name} description={`Head: ${f.head_name ?? '—'} · ${members.length} members`}
        crumbs={[{ label: 'Families', href: '/families' }, { label: f.name }]}
        actions={has('families.edit') ? <Button size="sm" onClick={() => { loadMemberOpts(); setLinkOpen(true); }}>Link member</Button> : undefined} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details">
          <dl className="space-y-2 text-sm">
            {[['Address', f.address], ['City', f.city], ['Phone', f.phone], ['Notes', f.notes]].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-slate-800">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="lg:col-span-2" title="Members"
          actions={has('families.edit') ? <Button size="sm" variant="secondary" onClick={() => { loadMemberOpts(); setLinkOpen(true); }}>+ Link member</Button> : undefined}>
          {members.length === 0 ? <p className="text-sm text-slate-500">No members linked yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {members.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/members/${m.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                      {m.first_name} {m.last_name}
                    </Link>
                    <p className="text-xs text-slate-500">{m.phone ?? ''} {m.email ? `· ${m.email}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color="none">{m.role ?? 'member'}</Badge>
                    {has('families.edit') && (
                      <button className="text-xs text-red-500 hover:underline" onClick={() => unlink(m.id)}>unlink</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Link a member">
        <div className="space-y-4">
          <Field label="Member" required>
            <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select…</option>
              {memberOpts.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.member_no})</option>)}
            </Select>
          </Field>
          <Field label="Role in family">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="head">Head</option><option value="spouse">Spouse</option><option value="child">Child</option><option value="other">Other</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={linkMember} disabled={busy || !selected}>{busy ? 'Linking…' : 'Link'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
