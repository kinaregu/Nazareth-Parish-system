'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, Modal, PageHeader, Select, Skeleton, Textarea } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function PortalPrayerPage() {
  const [mine, setMine] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ text: '', category: 'other', visibility: 'pastoral' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api('/api/v1/portal/prayer-requests')
      .then((r: any) => setMine(r.data ?? []))
      .catch(() => setMine([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/api/v1/pastoral/prayers', { method: 'POST', body: f });
      toast.success('Your prayer request has been received.');
      setOpen(false);
      setF({ text: '', category: 'other', visibility: 'pastoral' });
      load();
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const close = async (id: string) => {
    try {
      await api(`/api/v1/portal/prayer-requests/${id}/close`, { method: 'POST', body: {} });
      load();
    } catch (e: any) {
      toast.error(errMessage(e));
    }
  };

  if (loading) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Prayer requests" description="Submit requests and see the status of yours"
        crumbs={[{ label: 'Church' }, { label: 'Prayer requests' }]}
        actions={<Button onClick={() => setOpen(true)}>+ New request</Button>} />

      {mine.length === 0 ? (
        <Card><p className="text-sm text-slate-500">You haven’t submitted any prayer requests yet. The church is praying for you — let us know what to pray about.</p></Card>
      ) : (
        <div className="grid gap-3">
          {mine.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge color={r.status}>{r.status}</Badge>
                    <Badge color="none">{r.category}</Badge>
                    <Badge color={r.visibility}>{r.visibility}</Badge>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.text}</p>
                  {r.response && <p className="mt-2 rounded-lg bg-primary-50 p-2 text-xs text-primary-800">Response: {r.response}</p>}
                  <p className="mt-2 text-xs text-slate-400">{fmtDate(r.created_at)}</p>
                </div>
                {r.status === 'active' && (
                  <Button size="sm" variant="ghost" onClick={() => close(r.id)}>Withdraw</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New prayer request">
        <div className="space-y-4">
          <Field label="What should we pray about?" required>
            <Textarea required value={f.text} onChange={(e) => setF((x: any) => ({ ...x, text: e.target.value }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select value={f.category} onChange={(e) => setF((x: any) => ({ ...x, category: e.target.value }))}>
                {['health', 'family', 'financial', 'work', 'spiritual', 'gratitude', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Who sees this?">
              <Select value={f.visibility} onChange={(e) => setF((x: any) => ({ ...x, visibility: e.target.value }))}>
                <option value="private">Only me & pastors</option>
                <option value="pastoral">Pastoral team</option>
                <option value="church">Whole church</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy || f.text.trim().length < 3}>{busy ? 'Sending…' : 'Submit request'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
