'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Field, Input, Select, Textarea, PageHeader } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

export default function NewMinistryPage() {
  const router = useRouter();
  const [f, setF] = useState<any>({ branch_id: '', name: '', description: '', leader_id: '', meeting_day: '', meeting_time: '', location: '' });
  const [branches, setBranches] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF((p: any) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    api('/api/v1/branches').then((r: any) => setBranches(r.data ?? [])).catch(() => {});
    api('/api/v1/members?status=active&pageSize=500&sort=first_name').then((r: any) => setMembers(r.data ?? [])).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/api/v1/ministries', {
        method: 'POST',
        body: { ...f, leader_id: f.leader_id || undefined, meeting_day: f.meeting_day || undefined, meeting_time: f.meeting_time || undefined, location: f.location || undefined, description: f.description || undefined },
      });
      toast.success('Ministry created.');
      router.push(`/ministries/${r.data.id}`);
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="New ministry" crumbs={[{ label: 'Ministries', href: '/ministries' }, { label: 'New' }]} />
      <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><Input required value={f.name} onChange={set('name')} placeholder="e.g. Worship & Music" /></Field>
          <Field label="Branch" required>
            <Select required value={f.branch_id} onChange={set('branch_id')}>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Leader">
            <Select value={f.leader_id} onChange={set('leader_id')}>
              <option value="">—</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
            </Select>
          </Field>
          <Field label="Location"><Input value={f.location} onChange={set('location')} /></Field>
          <Field label="Meeting day">
            <Select value={f.meeting_day} onChange={set('meeting_day')}>
              <option value="">—</option>
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Meeting time"><Input type="time" value={f.meeting_time} onChange={set('meeting_time')} /></Field>
        </div>
        <Field label="Description"><Textarea value={f.description} onChange={set('description')} /></Field>
        <div className="flex justify-end gap-2">
          <Link href="/ministries"><Button type="button" variant="secondary">Cancel</Button></Link>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create ministry'}</Button>
        </div>
      </form>
    </div>
  );
}
