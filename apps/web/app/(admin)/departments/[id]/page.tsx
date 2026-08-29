'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api } from '@/lib/client';

export default function DepartmentDetailPage({ params }: { params: { id: string } }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    api(`/api/v1/departments/${params.id}`).then((r: any) => setD(r.data)).catch(() => setD({}));
  }, [params.id]);

  if (!d) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;
  if (!d.id) return <div className="p-6 text-sm text-red-600">Department not found.</div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title={d.name} description={d.description ?? 'Department'}
        crumbs={[{ label: 'Departments', href: '/departments' }, { label: d.name }]} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details">
          <dl className="space-y-2 text-sm">
            {[['Head', d.leader_name], ['Ministry', d.ministry_name], ['Branch', d.branch_name], ['Responsibilities', d.responsibilities]].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-slate-800">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="lg:col-span-2" title={`Team (${(d.members ?? []).length})`}>
          {(d.members ?? []).length === 0 ? <p className="text-sm text-slate-500">No team members yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {(d.members ?? []).map((x: any) => (
                <li key={x.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/members/${x.id}`} className="font-medium text-primary-700 hover:underline">{x.first_name} {x.last_name}</Link>
                  <span className="text-slate-500">{x.role ?? 'member'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
