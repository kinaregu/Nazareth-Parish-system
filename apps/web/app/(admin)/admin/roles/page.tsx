'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api } from '@/lib/client';

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/v1/roles').then((r: any) => setRoles(r.data ?? [])).catch(() => setRoles([])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-80" /></div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Roles & permissions" description="System roles with their permission grants. A user's access is the union of their roles (super-admin has all)."
        crumbs={[{ label: 'Administration' }, { label: 'Roles' }]} />

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((r) => (
          <Card key={r.code} title={<span>{r.name} <span className="ml-2 font-mono text-xs text-slate-400">{r.code}</span></span>}
            actions={<Badge color="none">{r.users} user{r.users === 1 ? '' : 's'}</Badge>}>
            <p className="text-sm text-slate-500">{r.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {Array.isArray(r.permissions) && r.permissions.length === 1 && r.permissions[0] === '*' ? (
                <Badge color="church">* (all permissions)</Badge>
              ) : (
                r.permissions.map((p: string) => <Badge key={p} color="none">{p}</Badge>)
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
