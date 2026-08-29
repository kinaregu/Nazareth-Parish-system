'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/client';

export default function RegisterPage() {
  const [f, setF] = useState<any>({
    first_name: '', last_name: '', middle_name: '', gender: '', date_of_birth: '',
    email: '', phone: '', address: '', city: '', country: '', family_name: '',
    previous_church: '', heard_from: 'friend', interests: [] as string[], message: '',
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<any>) => setF((p: any) => ({ ...p, [k]: e.target.value }));
  const toggleInterest = (i: string) =>
    setF((p: any) => ({ ...p, interests: p.interests.includes(i) ? p.interests.filter((x: string) => x !== i) : [...p.interests, i] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/v1/registrations', { method: 'POST', body: f });
      setDone(true);
      toast.success('Registration submitted. The church office will review it shortly.');
    } catch (err: any) {
      toast.error(err.message ?? 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper p-6 text-center">
        <img src="/brand/logo.png" alt="" className="h-16 w-16 rounded-full bg-white p-1 shadow" />
        <h1 className="font-serif text-xl font-semibold text-primary-800">Thank you, {f.first_name || 'friend'}</h1>
        <p className="max-w-md text-sm text-slate-600">
          Your registration has been received. A church administrator will review it — if approved, you’ll receive
          an email with your portal login details.
        </p>
        <Link href="/login" className="mt-2"><Button variant="secondary">Back to sign in</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="/brand/logo.png" alt="" className="h-12 w-12 rounded-full bg-white object-contain p-0.5 shadow" />
          <div>
            <h1 className="font-serif text-xl font-semibold text-primary-800">Become a member of Nazareth Parish</h1>
            <p className="text-sm text-slate-500">Tell us a little about yourself. The church office will follow up.</p>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5 sm:p-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required><Input required value={f.first_name} onChange={set('first_name')} /></Field>
            <Field label="Middle name"><Input value={f.middle_name} onChange={set('middle_name')} /></Field>
            <Field label="Last name" required><Input required value={f.last_name} onChange={set('last_name')} /></Field>
            <Field label="Gender">
              <Select value={f.gender} onChange={set('gender')}>
                <option value="">Select…</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Date of birth"><Input type="date" value={f.date_of_birth} onChange={set('date_of_birth')} /></Field>
            <Field label="Email" required><Input type="email" required value={f.email} onChange={set('email')} /></Field>
            <Field label="Phone" required><Input required value={f.phone} onChange={set('phone')} placeholder="+211 9…" /></Field>
            <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
          </div>
          <Field label="Address"><Input value={f.address} onChange={set('address')} /></Field>
          <Field label="Family / household name" hint="If you’re joining with family, share the household name.">
            <Input value={f.family_name} onChange={set('family_name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Previous church (optional)"><Input value={f.previous_church} onChange={set('previous_church')} /></Field>
            <Field label="How did you hear about us?">
              <Select value={f.heard_from} onChange={set('heard_from')}>
                <option value="friend">A friend</option><option value="family">Family</option><option value="online">Online</option>
                <option value="social_media">Social media</option><option value="other">Other</option>
              </Select>
            </Field>
          </div>
          <Field label="Areas you’d like to serve in">
            <div className="flex flex-wrap gap-2">
              {['Worship', 'Youth', 'Children', 'Prayer', 'Missions', 'Hospitality', 'Ushering', 'Media'].map((i) => (
                <label key={i} className="cursor-pointer">
                  <input type="checkbox" className="peer sr-only" checked={f.interests.includes(i)} onChange={() => toggleInterest(i)} />
                  <span className="inline-block rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 peer-checked:border-primary-500 peer-checked:bg-primary-50 peer-checked:text-primary-700">
                    {i}
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Anything you’d like the church to know?">
            <Textarea value={f.message} onChange={set('message')} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Link href="/login"><Button type="button" variant="secondary">Cancel</Button></Link>
            <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit registration'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
