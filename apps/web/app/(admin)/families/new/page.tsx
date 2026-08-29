'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Field, Input, Textarea, PageHeader } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

export default function NewFamilyPage() {
  const router = useRouter();
  const [f, setF] = useState<any>({ name: '', head_name: '', address: '', city: '', phone: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF((p: any) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/api/v1/families', { method: 'POST', body: f });
      toast.success('Family created.');
      router.push(`/families/${r.data.id}`);
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="New family" crumbs={[{ label: 'Families', href: '/families' }, { label: 'New' }]} />
      <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Family name" required><Input required value={f.name} onChange={set('name')} placeholder="e.g. Deng family" /></Field>
          <Field label="Head of household"><Input value={f.head_name} onChange={set('head_name')} /></Field>
          <Field label="Address"><Input value={f.address} onChange={set('address')} /></Field>
          <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        </div>
        <Field label="Notes"><Textarea value={f.notes} onChange={set('notes')} /></Field>
        <p className="text-xs text-slate-400">You can link individual members to this family afterwards.</p>
        <div className="flex justify-end gap-2">
          <Link href="/families"><Button type="button" variant="secondary">Cancel</Button></Link>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create family'}</Button>
        </div>
      </form>
    </div>
  );
}
