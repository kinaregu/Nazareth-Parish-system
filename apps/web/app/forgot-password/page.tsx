'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, Field, Input } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/v1/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      toast.error(errMessage(err, 'Could not send the reset link.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6" noValidate>
        <div>
          <h1 className="font-serif text-xl font-semibold text-primary-800">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your account email and we’ll send you a reset link.</p>
        </div>
        {sent ? (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox (in development,
            the Dev Outbox under Administration).
          </div>
        ) : (
          <Field label="Email" required>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@nazarethparish.org" />
          </Field>
        )}
        <div className="flex justify-between">
          <Link href="/login"><Button type="button" variant="secondary">Back to sign in</Button></Link>
          {!sent && <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>}
        </div>
      </form>
    </div>
  );
}
