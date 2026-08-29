'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, PageHeader, Skeleton, useMe } from '@/components/ui/primitives';
import { api } from '@/lib/client';

export default function PortalGroupsPage() {
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

  const groups = inv?.groups ?? [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My groups & cells" crumbs={[{ label: 'My Life at Church' }, { label: 'Groups' }]} />
      {!me?.scope.linkedMemberId ? (
        <Card><p className="text-sm text-slate-500">No member profile is linked to your account.</p></Card>
      ) : groups.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">You are not in a small group yet — ask your pastor or a group leader about joining a cell near you.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g: any) => (
            <Card key={g.id}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800">{g.name}</p>
                <Badge color="none">{g.role ?? 'member'}</Badge>
              </div>
              {(g.meeting_day || g.location) && (
                <p className="mt-1 text-xs text-slate-500">
                  {[g.meeting_day, g.meeting_time].filter(Boolean).join(' ') || 'Meets regularly'}
                  {g.location ? ` · ${g.location}` : ''}
                </p>
              )}
              {g.leader_name && <p className="mt-1 text-xs text-slate-400">Leader: {g.leader_name}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
