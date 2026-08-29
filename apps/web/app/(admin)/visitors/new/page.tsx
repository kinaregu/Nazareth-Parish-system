'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Field, Input, Select, Textarea, PageHeader } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

export default function NewVisitorPage() {
  const router = useRouter();
  const [f, setF] = useState<any>({
    first_name: '', last_name: '', preferred_name: '', phone: '', email: '',
    visit_date: new Date().toISOString().slice(0, 10), branch_id: '', heard_from: '',
    previous_church: '', notes: '',
  });
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<any>) => setF((p: any) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    api('/api/v1/branches').then((r: any) => setBranches(r.data ?? [])).catch(() => {});
    api('/api/v1/attendance/services').then((r: any) => setServices(r.data ?? [])).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/v1/visitors', { method: 'POST', body: { ...f, service_id: f.service_id || undefined } });
      toast.success('Visitor recorded.');
      router.push('/visitors');
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Add visitor" description="Record a first-time guest."
        crumbs={[{ label: 'Visitors', href: '/visitors' }, { label: 'New' }]} />
      <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" required><Input required value={f.first_name} onChange={set('first_name')} /></Field>
          <Field label="Last name" required><Input required value={f.last_name} onChange={set('last_name')} /></Field>
          <Field label="Preferred name"><Input value={f.preferred_name} onChange={set('preferred_name')} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Visit date"><Input type="date" value={f.visit_date} onChange={set('visit_date')} /></Field>
          <Field label="Branch" required>
            <Select required value={f.branch_id} onChange={set('branch_id')}>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Service visited">
            <Select value={f.service_id ?? ''} onChange={set('service_id')}>
              <option value="">—</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="How they heard">
            <Select value={f.heard_from} onChange={set('heard_from')}>
              <option value="">—</option>
              <option value="friend">Friend</option><option value="family">Family</option><option value="online">Online</option><option value="other">Other</option>
            </Select>
          </Field>
        </div>
        <Field label="Previous church"><Input value={f.previous_church} onChange={set('previous_church')} /></Field>
        <Field label="Notes"><Textarea value={f.notes} onChange={set('notes')} /></Field>
        <div className="flex justify-end gap-2">
          <Link href="/visitors"><Button type="button" variant="secondary">Cancel</Button></Link>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record visitor'}</Button>
        </div>
      </form>
    </div>
  );
}
