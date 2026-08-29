'use client';

import { useEffect } from 'react';
import { Skeleton, useMe } from '@/components/ui/primitives';

/**
 * Guards the administration portal:
 *  - unauthenticated users are redirected to /login (handled by MeProvider)
 *  - member/visitor-only accounts are sent to the member portal
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { me, loading, isStaff } = useMe();
  if (loading || !me) {
    return (
      <div className="min-h-screen bg-paper p-8">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="mb-3 h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!isStaff) {
    // Send non-staff users to the portal (the API enforces the same rule).
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper p-8 text-center">
        <p className="text-sm text-slate-600">You’re signed in as a member. Redirecting to the member portal…</p>
        <RedirectToPortal />
      </div>
    );
  }
  return <>{children}</>;
}

function RedirectToPortal() {
  useEffect(() => {
    window.location.href = '/portal';
  }, []);
  return null;
}
