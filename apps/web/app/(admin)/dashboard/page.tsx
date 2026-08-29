'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, StatCard, Badge, Skeleton, Button, PageHeader, useMe } from '@/components/ui/primitives';
import { api, fmtMoney, fmtDate } from '@/lib/client';

export default function DashboardPage() {
  const { me } = useMe();
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    api('/api/v1/dashboard').then((r: any) => setD(r.data)).catch(() => {});
  }, []);

  if (!d) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const has = (w: string) => d.widgets?.includes(w);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title={`Welcome, ${me?.user?.name?.split(' ')[0] ?? 'friend'}`}
        description={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {has('members') && (
          <>
            <StatCard label="Total members" value={d.members.total} sub={<Link className="text-primary-600 hover:underline" href="/members">View directory →</Link>} />
            <StatCard label="Active" value={d.members.active} sub={`${Math.round((100 * d.members.active) / Math.max(1, d.members.total))}% of total`} tone="green" />
            <StatCard label="New this month" value={d.members.newThisMonth} tone="gold" />
          </>
        )}
        {has('visitors') && (
          <>
            <StatCard label="Visitors this month" value={d.visitors.thisMonth} sub={`${d.visitors.total} all-time`} />
            <StatCard label="Need follow-up" value={d.visitors.needsFollowup} tone={d.visitors.needsFollowup > 0 ? 'red' : 'default'} sub={<Link className="text-primary-600 hover:underline" href="/visitors">Visiters →</Link>} />
          </>
        )}
        {has('followups') && (
          <>
            <StatCard label="Follow-ups pending" value={d.followups.pending} sub={`${d.followups.overdue} overdue`} tone={d.followups.overdue > 0 ? 'red' : 'default'} />
            <StatCard label="Open pastoral cases" value={d.pastoral?.open ?? 0} />
          </>
        )}
        {has('giving') && (
          <>
            <StatCard label="Giving this month" value={fmtMoney(d.giving.thisMonth)} sub={`${d.giving.giversThisMonth} givers`} tone="gold" />
            <StatCard label="Year to date" value={fmtMoney(d.giving.thisYear)} />
          </>
        )}
        {has('expenses') && <StatCard label="Expenses this month" value={fmtMoney(d.expenses.thisMonth)} sub={`${d.expenses.awaitingApproval} awaiting approval`} />}
        {has('prayer') && <StatCard label="Active prayer requests" value={d.prayer.active} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {has('attendance') && (
          <Card className="lg:col-span-2" title="Attendance — last 12 weeks"
            actions={<Link href="/attendance/reports" className="text-sm text-primary-600 hover:underline">Reports →</Link>}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.attendanceTrend}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1b3a6b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#1b3a6b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Area type="monotone" dataKey="present" name="Present" stroke="#1b3a6b" fill="url(#g1)" strokeWidth={2} />
                  <Area type="monotone" dataKey="absent" name="Absent" stroke="#c9a227" fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card title="Upcoming events" actions={<Link href="/calendar" className="text-sm text-primary-600 hover:underline">Calendar →</Link>}>
          <ul className="divide-y divide-slate-100">
            {(d.upcomingEvents ?? []).map((e: any) => (
              <li key={e.id} className="py-2.5">
                <Link href={`/events/${e.id}`} className="group block">
                  <p className="text-sm font-medium text-slate-800 group-hover:text-primary-700">{e.title}</p>
                  <p className="text-xs text-slate-500">{fmtDate(e.starts_at)} · {e.location ?? 'Parish hall'} · {e.registered} registered</p>
                </Link>
              </li>
            ))}
            {(!d.upcomingEvents || d.upcomingEvents.length === 0) && <li className="py-3 text-sm text-slate-500">No upcoming events.</li>}
          </ul>
          <Link href="/events/new"><Button size="sm" variant="secondary" className="mt-2 w-full">+ New event</Button></Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {has('followups') && (
          <Card title="Needs attention — follow-ups" actions={<Link href="/pastoral/followups" className="text-sm text-primary-600 hover:underline">All →</Link>}>
            <ul className="divide-y divide-slate-100">
              {(d.pendingFollowups ?? []).map((f: any) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{f.member_name ?? 'General'}</p>
                    <p className="truncate text-xs text-slate-500">{f.reason}</p>
                  </div>
                  <Badge color="planned">{String(f.due_date).slice(0, 10)}</Badge>
                </li>
              ))}
              {(!d.pendingFollowups || d.pendingFollowups.length === 0) && <li className="py-3 text-sm text-slate-500">Nothing pending.</li>}
            </ul>
          </Card>
        )}

        <Card title="Recent announcements" actions={<Link href="/announcements" className="text-sm text-primary-600 hover:underline">Manage →</Link>}>
          <ul className="divide-y divide-slate-100">
            {(d.recentAnnouncements ?? []).map((a: any) => (
              <li key={a.id} className="py-2">
                <p className="text-sm text-slate-800">{a.title}</p>
                <p className="text-xs text-slate-500">{fmtDate(a.created_at)}</p>
              </li>
            ))}
            {(!d.recentAnnouncements || d.recentAnnouncements.length === 0) && <li className="py-3 text-sm text-slate-500">No announcements yet.</li>}
          </ul>
        </Card>

        {(has('ministry') || has('group')) && (
          <Card title={has('ministry') ? 'My ministries' : 'My groups'}>
            <ul className="divide-y divide-slate-100">
              {(d.myMinistries ?? d.myGroups ?? []).map((m: any) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{m.name}</p>
                    <p className="text-xs text-slate-500">{m.meeting_day ? `${m.meeting_day} ${m.meeting_time ?? ''}`.trim() : ''}</p>
                  </div>
                  <Badge color="none">{m.members} members</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
