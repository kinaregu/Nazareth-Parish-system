'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Field, Input, Select, Textarea, PageHeader } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

export default function NewMemberPage() {
  const router = useRouter();
  const [f, setF] = useState<any>({
    first_name: '', middle_name: '', last_name: '', gender: '', date_of_birth: '',
    phone: '', email: '', address: '', city: '', country: '',
    branch_id: '', status: 'active', date_joined: new Date().toISOString().slice(0, 10),
    baptism_status: '', previous_church: '', volunteer: false, notes: '',
  });
  const [branches, setBranches] = useState<any[]>([]);
  const [dups, setDups] = useState<any[]>([]);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<any>) => setF((p: any) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    api('/api/v1/branches').then((r: any) => setBranches(r.data ?? [])).catch(() => {});
  }, []);

  // Duplicate detection (name / phone / email)
  useEffect(() => {
    if (!f.first_name || !f.last_name) { setDups([]); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const sp = new URLSearchParams({ first_name: f.first_name, last_name: f.last_name });
        if (f.phone) sp.set('phone', f.phone);
        if (f.email) sp.set('email', f.email);
        const r = await api(`/api/v1/members/duplicates?${sp}`);
        setDups(r.data ?? []);
      } catch { setDups([]); }
      setChecking(false);
    }, 500);
    return () => clearTimeout(t);
  }, [f.first_name, f.last_name, f.phone, f.email]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.branch_id) { toast.error('Please choose a branch.'); return; }
    setBusy(true);
    try {
      const r = await api('/api/v1/members', { method: 'POST', body: f });
      toast.success('Member created.');
      router.push(`/members/${r.data.id}`);
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Add member" description="Create a new member profile. Duplicate detection runs as you type."
        crumbs={[{ label: 'Members', href: '/members' }, { label: 'New' }]} />

      {dups.length > 0 && (
        <div role="alert" className="card border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Possible duplicate(s) found</p>
          <ul className="mt-1 space-y-1">
            {dups.map((d) => (
              <li key={d.id} className="text-sm text-amber-800">
                <Link className="font-medium underline" href={`/members/${d.id}`}>{d.first_name} {d.last_name}</Link>
                {' '}({d.member_no}){d.phone ? ` · ${d.phone}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {checking && <p className="text-xs text-slate-400">Checking for duplicates…</p>}

      <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" required><Input required value={f.first_name} onChange={set('first_name')} /></Field>
          <Field label="Middle name"><Input value={f.middle_name} onChange={set('middle_name')} /></Field>
          <Field label="Last name" required><Input required value={f.last_name} onChange={set('last_name')} /></Field>
          <Field label="Branch" required>
            <Select required value={f.branch_id} onChange={set('branch_id')}>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Gender">
            <Select value={f.gender} onChange={set('gender')}>
              <option value="">Select…</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Date of birth"><Input type="date" value={f.date_of_birth} onChange={set('date_of_birth')} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set('phone')} placeholder="+211 9…" /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Date joined"><Input type="date" value={f.date_joined} onChange={set('date_joined')} /></Field>
          <Field label="Status">
            <Select value={f.status} onChange={set('status')}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
              <option value="transferred">Transferred</option><option value="suspended">Suspended</option>
            </Select>
          </Field>
          <Field label="Baptism status">
            <Select value={f.baptism_status} onChange={set('baptism_status')}>
              <option value="">Unknown</option><option value="baptized">Baptized</option><option value="pending">Pending</option><option value="not_applicable">N/A</option>
            </Select>
          </Field>
          <Field label="Previous church"><Input value={f.previous_church} onChange={set('previous_church')} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Address"><Input value={f.address} onChange={set('address')} /></Field>
          <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
          <Field label="Country"><Input value={f.country} onChange={set('country')} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.volunteer} onChange={(e) => setF((p: any) => ({ ...p, volunteer: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
          Available for volunteer service
        </label>
        <Field label="Notes"><Textarea value={f.notes} onChange={set('notes')} placeholder="Anything the office should know…" /></Field>
        <div className="flex justify-end gap-2">
          <Link href="/members"><Button type="button" variant="secondary">Cancel</Button></Link>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create member'}</Button>
        </div>
      </form>
    </div>
  );
}
