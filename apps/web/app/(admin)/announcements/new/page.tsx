'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Field, Input, Select, Textarea, PageHeader } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

export default function NewAnnouncementPage() {
  const router = useRouter();
  const [f, setF] = useState<any>({
    branch_id: '', title: '', content: '', audience_type: 'all',
    audience_ref: '', publish_at: '', expires_at: '', status: 'draft',
  });
  const [branches, setBranches] = useState<any[]>([]);
  const [ministries, setMinistries] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
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
    setBusy(true);
    try {
      const audience =
        f.audience_type === 'all' ? { type: 'all' }
          : f.audience_type === 'branch' ? { type: 'branch', branch_id: f.branch_id }
            : f.audience_type === 'ministry' ? { type: 'ministry', ministry_id: f.audience_ref }
              : { type: 'group', group_id: f.audience_ref };
      const r = await api('/api/v1/announcements', {
        method: 'POST',
        body: {
          branch_id: f.branch_id,
          title: f.title,
          content: f.content,
          audience,
          publish_at: f.publish_at ? new Date(f.publish_at).toISOString() : undefined,
          expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : undefined,
          status: f.status,
        },
      });
      toast.success(f.status === 'published' ? 'Announcement published and members notified.' : 'Announcement saved.');
      router.push('/announcements');
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="New announcement" description="Targeted in-app + email notification to the chosen audience."
        crumbs={[{ label: 'Announcements', href: '/announcements' }, { label: 'New' }]} />
      <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2"><Input required value={f.title} onChange={set('title')} /></Field>
          <Field label="Branch" required>
            <Select required value={f.branch_id} onChange={set('branch_id')}>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Audience">
            <Select value={f.audience_type} onChange={set('audience_type')}>
              <option value="all">Everyone</option>
              <option value="branch">Everyone in this branch</option>
              <option value="ministry">A ministry</option>
              <option value="group">A group</option>
            </Select>
          </Field>
          {f.audience_type === 'ministry' && (
            <Field label="Ministry">
              <Select value={f.audience_ref} onChange={set('audience_ref')}>
                <option value="">Select…</option>
                {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
          )}
          {f.audience_type === 'group' && (
            <Field label="Group">
              <Select value={f.audience_ref} onChange={set('audience_ref')}>
                <option value="">Select…</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Publish (schedule) at">
            <Input type="datetime-local" value={f.publish_at} onChange={set('publish_at')} />
          </Field>
          <Field label="Expires at (optional)">
            <Input type="datetime-local" value={f.expires_at} onChange={set('expires_at')} />
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={set('status')}>
              <option value="draft">Draft (not sent)</option>
              <option value="scheduled">Scheduled (sends at publish time)</option>
              <option value="published">Publish now</option>
            </Select>
          </Field>
        </div>
        <Field label="Content" required>
          <Textarea required className="min-h-[140px]" value={f.content} onChange={set('content')} placeholder="Write your announcement…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Link href="/announcements"><Button type="button" variant="secondary">Cancel</Button></Link>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : f.status === 'published' ? 'Publish now' : 'Save'}</Button>
        </div>
      </form>
    </div>
  );
}
