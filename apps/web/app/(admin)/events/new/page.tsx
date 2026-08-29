'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Field, Input, Select, Textarea, Checkbox, PageHeader } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

export default function NewEventPage() {
  const router = useRouter();
  const [f, setF] = useState<any>({
    title: '', description: '', location: '', starts_at: '', ends_at: '', branch_id: '',
    capacity: '', allows_registration: true, visibility: 'members', ministry_id: '', group_id: '', status: 'draft',
  });
  const [ministries, setMinistries] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF((p: any) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    api('/api/v1/branches').then((r: any) => {
      const d = r.data ?? [];
      setBranches(d);
      if (d.length === 1) setF((p: any) => ({ ...p, branch_id: d[0].id }));
    }).catch(() => {});
    api('/api/v1/ministries?pageSize=200').then((r: any) => setMinistries(r.data ?? [])).catch(() => {});
    api('/api/v1/groups?pageSize=200').then((r: any) => setGroups(r.data ?? [])).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.starts_at) { toast.error('Set a start date and time.'); return; }
    setBusy(true);
    try {
      const r = await api('/api/v1/events', {
        method: 'POST',
        body: {
          branch_id: f.branch_id,
          title: f.title,
          starts_at: new Date(f.starts_at).toISOString(),
          ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : undefined,
          location: f.location || undefined,
          capacity: f.capacity ? Number(f.capacity) : undefined,
          registration_required: f.allows_registration,
          visibility: f.visibility,
          ministry_id: f.ministry_id || undefined,
          group_id: f.group_id || undefined,
          description: f.description || undefined,
          status: f.status,
        },
      });
      toast.success('Event created.');
      router.push(`/events/${r.data.id}`);
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="New event" crumbs={[{ label: 'Events', href: '/events' }, { label: 'New' }]} />
      <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2"><Input required value={f.title} onChange={set('title')} /></Field>
          <Field label="Branch" required>
            <Select required value={f.branch_id} onChange={set('branch_id')}>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Starts" required><Input type="datetime-local" required value={f.starts_at} onChange={set('starts_at')} /></Field>
          <Field label="Ends (optional)"><Input type="datetime-local" value={f.ends_at} onChange={set('ends_at')} /></Field>
          <Field label="Location"><Input value={f.location} onChange={set('location')} placeholder="Parish hall, main sanctuary…" /></Field>
          <Field label="Capacity (optional)"><Input type="number" min="1" value={f.capacity} onChange={set('capacity')} /></Field>
          <Field label="Organizing ministry">
            <Select value={f.ministry_id} onChange={set('ministry_id')}>
              <option value="">—</option>
              {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Organizing group">
            <Select value={f.group_id} onChange={set('group_id')}>
              <option value="">—</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label="Who can see this event?">
            <Select value={f.visibility} onChange={set('visibility')}>
              <option value="members">All members</option>
              <option value="ministry">Members of the organizing ministry</option>
              <option value="group">Members of the organizing group</option>
              <option value="public">Public</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={set('status')}>
              <option value="draft">Draft</option>
              <option value="published">Published (announcements sent)</option>
            </Select>
          </Field>
        </div>
        <Checkbox label="Allow member registration" checked={f.allows_registration} onChange={(e) => setF((p: any) => ({ ...p, allows_registration: e.target.checked }))} />
        <Field label="Description"><Textarea value={f.description} onChange={set('description')} /></Field>
        <div className="flex justify-end gap-2">
          <Link href="/events"><Button type="button" variant="secondary">Cancel</Button></Link>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create event'}</Button>
        </div>
      </form>
    </div>
  );
}
