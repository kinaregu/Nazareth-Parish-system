'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function Verify() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    if (!token) { setState('error'); return; }
    fetch(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (r) => setState(r.ok ? 'ok' : 'error'))
      .catch(() => setState('error'));
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper p-6 text-center">
      {state === 'checking' && <p className="text-sm text-slate-500">Verifying your email…</p>}
      {state === 'ok' && (
        <>
          <img src="/brand/logo.png" alt="" className="h-14 w-14 rounded-full bg-white p-1 shadow" />
          <h1 className="font-serif text-xl font-semibold text-primary-800">Email verified</h1>
          <p className="text-sm text-slate-500">Your email address is confirmed. You can now sign in.</p>
          <a href="/login" className="text-sm font-medium text-primary-600 hover:underline">Go to sign in →</a>
        </>
      )}
      {state === 'error' && (
        <>
          <h1 className="font-serif text-xl font-semibold text-primary-800">Verification failed</h1>
          <p className="max-w-sm text-sm text-slate-500">This link is invalid or has expired. Please request a new one from the settings page.</p>
          <a href="/login" className="text-sm font-medium text-primary-600 hover:underline">Go to sign in →</a>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
