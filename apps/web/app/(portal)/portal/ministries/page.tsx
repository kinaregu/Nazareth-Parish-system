'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, PageHeader, Skeleton, useMe } from '@/components/ui/primitives';
import { api } from '@/lib/client';

export default function PortalMinistriesPage() {
  const { me } = useMe();
  const [inv, setInv] = useState<any>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!me?.scope.linkedMemberId) { setChecked(true); return; }
    api(`/api/v1/members/${me.scope.linkedMemberId}/involvement`)
      .then((r: any) => { setInv(r.data); setChecked(true); })
      .catch(() => setChecked(true));
  }, [me?.scope.linkedMemberId]);

  if (!checked) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-56" /></div>;

  const ministries = inv?.ministries ?? [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My ministries" crumbs={[{ label: 'My Life at Church' }, { label: 'Ministries' }]} />
      {!me?.scope.linkedMemberId ? (
        <Card><p className="text-sm text-slate-500">No member profile is linked to your account.</p></Card>
      ) : ministries.length === 0 ? (
        <Card><p className="text-sm text-slate-500">You are not serving in a ministry yet. Use an announcement or ask a ministry leader to be added.</p></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ministries.map((m: any) => (
            <Card key={m.id}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800">{m.name}</p>
                <Badge color="none">{m.role ?? 'member'}</Badge>
              </div>
              {(m.meeting_day || m.location) && (
                <p className="mt-1 text-xs text-slate-500">
                  {[m.meeting_day, m.meeting_time].filter(Boolean).join(' ') || 'Meets regularly'}
                  {m.location ? ` · ${m.location}` : ''}
                </p>
              )}
              {m.leader_name && <p className="mt-1 text-xs text-slate-400">Leader: {m.leader_name}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
