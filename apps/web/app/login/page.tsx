'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Field, Input } from '@/components/ui/primitives';
import { api, errMessage, getSessionToken, setSessionToken } from '@/lib/client';

const STAFF_ROLES = ['super_admin', 'pastor', 'admin', 'finance', 'ministry_leader', 'group_leader'];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [totpCode, setTotpCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a valid session token is already present (e.g. user reopens /login, or
  // the cookie channel is unavailable in this browser), skip straight in.
  useEffect(() => {
    const tok = getSessionToken();
    if (!tok) return;
    api('/api/v1/auth/me')
      .then((me: any) => {
        const d = me?.data ?? me;
        const staff = d?.scope?.roleCodes?.some((r: string) => STAFF_ROLES.includes(r));
        window.location.replace(`${staff ? '/dashboard' : '/portal'}#st=${encodeURIComponent(tok)}`);
      })
      .catch(() => {}); // invalid/expired token — api() already cleared it
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res: any = await api('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password, remember, totpCode: totpRequired ? totpCode : undefined },
      });
      const d = res?.data ?? res;
      if (d?.totpRequired) {
        setTotpRequired(true);
        return;
      }
      setSessionToken(d?.token ?? null);
      // Role-aware landing. The token also rides in the URL fragment as a
      // fallback channel for contexts that block cookies and storage.
      const me: any = await api('/api/v1/auth/me');
      const staff = (me?.data ?? me)?.scope?.roleCodes?.some((r: string) => STAFF_ROLES.includes(r));
      const landing = staff ? '/dashboard' : '/portal';
      window.location.href = d?.token ? `${landing}#st=${encodeURIComponent(d.token)}` : landing;
    } catch (err) {
      setError(errMessage(err, 'Unable to sign in. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/brand/logo.png" alt="Nazareth Parish Church" className="mb-3 h-20 w-20 rounded-full bg-white/95 object-contain p-1 shadow-lg" />
          <h1 className="font-serif text-2xl font-semibold text-white">Nazareth Parish Church</h1>
          <p className="mt-1 text-sm text-primary-200">Church Management System</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
          <div>
            <h2 className="font-serif text-lg font-semibold text-primary-800">Sign in</h2>
            <p className="text-xs text-slate-500">Enter your email and password to continue.</p>
          </div>
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {totpRequired && (
            <Field label="Two-factor code" required>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required
              />
            </Field>
          )}
          <Field label="Email" required>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@nazarethparish.org" />
          </Field>
          <Field label="Password" required>
            <Input type="password" autoComplete={totpRequired ? 'current-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
          </Field>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-300" />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-sm font-medium text-primary-600 hover:underline">Forgot password?</Link>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : totpRequired ? 'Verify code' : 'Sign in'}
          </Button>
          <p className="text-center text-xs text-slate-400">
            New to the parish? <Link href="/register" className="font-medium text-primary-600 hover:underline">Register as a member</Link>
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-primary-300">
          Demo: superadmin@nazarethparish.org · pastor@… · finance@… · member@… (password: Password123)
        </p>
      </div>
    </div>
  );
}
