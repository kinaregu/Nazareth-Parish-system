'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, PageHeader, Skeleton, useMe } from '@/components/ui/primitives';
import { api, fmtDate } from '@/lib/client';

export default function PortalHomePage() {
  const { me } = useMe();
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    api('/api/v1/dashboard').then((r: any) => setD(r.data)).catch(() => {});
  }, []);

  if (!d) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title={`Hello, ${me?.user?.name?.split(' ')[0] ?? 'friend'} 👋`}
        description="Here’s what’s happening at Nazareth Parish."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Upcoming events" actions={<Link href="/portal/events" className="text-sm text-primary-600 hover:underline">All events →</Link>}>
          <ul className="divide-y divide-slate-100">
            {(d.upcomingEvents ?? []).map((e: any) => (
              <li key={e.id} className="py-2.5">
                <Link href={`/events/${e.id}`} className="group block">
                  <p className="text-sm font-medium text-slate-800 group-hover:text-primary-700">{e.title}</p>
                  <p className="text-xs text-slate-500">{fmtDate(e.starts_at, 'long')} · {e.location ?? 'Parish hall'}</p>
                </Link>
              </li>
            ))}
            {(!d.upcomingEvents || d.upcomingEvents.length === 0) && <li className="py-3 text-sm text-slate-500">No upcoming events.</li>}
          </ul>
        </Card>

        <Card title="Latest announcements" actions={<Link href="/portal/announcements" className="text-sm text-primary-600 hover:underline">All →</Link>}>
          <ul className="divide-y divide-slate-100">
            {(d.recentAnnouncements ?? []).map((a: any) => (
              <li key={a.id} className="py-2">
                <p className="text-sm text-slate-800">{a.title}</p>
                <p className="text-xs text-slate-500">{fmtDate(a.created_at)}</p>
              </li>
            ))}
            {(!d.recentAnnouncements || d.recentAnnouncements.length === 0) && <li className="py-3 text-sm text-slate-500">No announcements.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/portal/attendance" className="card block p-4 transition hover:border-primary-300">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">My attendance</p>
          <p className="mt-1 text-lg font-semibold text-primary-700">See your record →</p>
        </Link>
        <Link href="/portal/prayer-requests" className="card block p-4 transition hover:border-primary-300">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Prayer</p>
          <p className="mt-1 text-lg font-semibold text-primary-700">Submit a request →</p>
        </Link>
        <Link href="/portal/giving" className="card block p-4 transition hover:border-primary-300">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">My giving</p>
          <p className="mt-1 text-lg font-semibold text-primary-700">View history →</p>
        </Link>
      </div>

      {me?.user?.must_change_password && (
        <div role="alert" className="card border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          You are using a temporary password. <Link href="/portal/settings" className="font-semibold underline">Change it now</Link>.
        </div>
      )}
    </div>
  );
}
