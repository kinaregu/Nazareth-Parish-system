'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, Skeleton, useMe } from '@/components/ui/primitives';
import { api, fmtDate } from '@/lib/client';

export default function PortalAttendancePage() {
  const { me } = useMe();
  const [a, setA] = useState<any>(null);

  useEffect(() => {
    if (!me?.scope.linkedMemberId) return;
    api(`/api/v1/members/${me.scope.linkedMemberId}/attendance`)
      .then((r: any) => setA(r.data))
      .catch(() => setA({ history: [], rate: 0 }));
  }, [me?.scope.linkedMemberId]);

  if (!me?.scope.linkedMemberId) {
    return <div className="p-6 text-sm text-slate-500">No member profile is linked to your account, so there is no attendance record to show.</div>;
  }
  if (!a) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-72" /></div>;

  const present = (a.history ?? []).filter((h: any) => ['present', 'first_time'].includes(h.status)).length;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My attendance" description="Your service attendance record" crumbs={[{ label: 'My Life at Church' }, { label: 'Attendance' }]} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><p className="text-xs uppercase text-slate-400">Rate (8 wks)</p><p className="text-2xl font-semibold text-primary-700">{Math.round(a.rate ?? 0)}%</p></Card>
        <Card><p className="text-xs uppercase text-slate-400">Sessions with a record</p><p className="text-2xl font-semibold text-slate-800">{(a.history ?? []).length}</p></Card>
        <Card><p className="text-xs uppercase text-slate-400">Present</p><p className="text-2xl font-semibold text-emerald-600">{present}</p></Card>
      </div>

      <Card title="Recent sessions">
        {(a.history ?? []).length === 0 ? <p className="text-sm text-slate-500">No attendance recorded yet.</p> : (
          <div className="flex flex-wrap gap-1.5">
            {(a.history ?? []).map((h: any) => (
              <div key={h.id ?? h.session_date}
                className={`rounded-lg border px-2.5 py-1.5 text-center text-xs ${
                  ['present', 'first_time'].includes(h.status) ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : h.status === 'excused' ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                <p className="font-medium">{fmtDate(h.session_date)}</p>
                <p>{h.service_name ?? 'Service'}</p>
                <p className="capitalize">{h.status.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
