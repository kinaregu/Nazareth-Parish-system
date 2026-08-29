'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, PageHeader, Skeleton, useMe } from '@/components/ui/primitives';
import { api } from '@/lib/client';

export default function PortalFamilyPage() {
  const { me } = useMe();
  const [f, setF] = useState<any>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!me?.scope.linkedMemberId) { setChecked(true); return; }
    api(`/api/v1/members/${me.scope.linkedMemberId}/family`)
      .then((r: any) => { setF(r.data); setChecked(true); })
      .catch(() => setChecked(true));
  }, [me?.scope.linkedMemberId]);

  if (!checked) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-56" /></div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My family" crumbs={[{ label: 'My Life at Church' }, { label: 'Family' }]} />
      {!me?.scope.linkedMemberId ? (
        <Card><p className="text-sm text-slate-500">No member profile is linked to your account.</p></Card>
      ) : !f?.name ? (
        <Card><p className="text-sm text-slate-500">You are not linked to a family record yet. The church office can link your household.</p></Card>
      ) : (
        <Card title={f.name} actions={<span className="text-xs text-slate-400">Head: {f.head_name ?? '—'}</span>}>
          <ul className="divide-y divide-slate-100">
            {(f.members ?? []).map((x: any) => (
              <li key={x.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-slate-800">{x.first_name} {x.last_name}</span>
                <span className="text-xs capitalize text-slate-500">{x.role ?? 'member'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
