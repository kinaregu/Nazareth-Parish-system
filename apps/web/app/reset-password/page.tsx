'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, Field, Input } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/v1/auth/reset-password', { method: 'POST', body: { token, password } });
      toast.success('Password updated. Sign in with your new password.');
      window.location.href = '/login';
    } catch (err) {
      toast.error(errMessage(err, 'Could not reset the password.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6" noValidate>
        <div>
          <h1 className="font-serif text-xl font-semibold text-primary-800">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500">Minimum 8 characters, with at least one letter and one number.</p>
        </div>
        <Field label="New password" required>
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" required>
          <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="flex justify-between">
          <Link href="/login"><Button type="button" variant="secondary">Back</Button></Link>
          <Button type="submit" disabled={busy || !token}>{busy ? 'Saving…' : 'Set new password'}</Button>
        </div>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
