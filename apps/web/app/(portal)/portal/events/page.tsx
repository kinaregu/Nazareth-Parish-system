'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function PortalEventsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRegs, setMyRegs] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api('/api/v1/events?status=published&pageSize=50')
      .then((r: any) => setItems((r.data ?? []).filter((e: any) => new Date(e.starts_at).getTime() > Date.now() - 86400000)))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    // my registrations
    api('/api/v1/portal/my-events').then((r: any) => setMyRegs(r.data ?? [])).catch(() => setMyRegs([]));
  }, [load]);

  const myReg = (eventId: string) => myRegs.find((r) => r.event_id === eventId);

  const register = async (e: any) => {
    setBusyId(e.id);
    try {
      await api(`/api/v1/events/${e.id}`, { method: 'POST', body: { status: 'registered' } });
      toast.success(`Registered for ${e.title}.`);
      api('/api/v1/portal/my-events').then((r: any) => setMyRegs(r.data ?? [])).catch(() => {});
    } catch (err: any) {
      toast.error(errMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-72" /></div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Church events" description="Published events you can see and register for"
        crumbs={[{ label: 'Church' }, { label: 'Events' }]} />

      {items.length === 0 ? (
        <Card><p className="text-sm text-slate-500">No upcoming events right now.</p></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((e) => {
            const reg = myReg(e.id);
            const canReg = e.registration_required && !reg;
            return (
              <Card key={e.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{e.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {fmtDate(e.starts_at, 'long')} · {e.location ?? 'Parish hall'}
                      {e.ministry_name ? ` · ${e.ministry_name}` : ''}
                    </p>
                    {e.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{e.description}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {reg ? <Badge color={reg.status}>{reg.status}</Badge> : e.registration_required ? <Badge color="none">registration open</Badge> : null}
                    {canReg && (
                      <Button size="sm" onClick={() => register(e)} disabled={busyId === e.id}>
                        {busyId === e.id ? 'Registering…' : 'Register'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
