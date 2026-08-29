'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, fmtDate } from '@/lib/client';

export default function PortalAnnouncementsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/v1/announcements/portal')
      .then((r: any) => setItems(r.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-72" /></div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Announcements" description="Published announcements addressed to you and your groups"
        crumbs={[{ label: 'Church' }, { label: 'Announcements' }]} />
      {items.length === 0 ? (
        <Card><p className="text-sm text-slate-500">No announcements right now.</p></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => (
            <Card key={a.id} title={<span>{a.title} <span className="ml-2 text-xs font-normal text-slate-400">{fmtDate(a.published_at ?? a.created_at)}</span></span>}>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{a.content}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
