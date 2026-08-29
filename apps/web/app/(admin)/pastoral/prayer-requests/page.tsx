'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function PrayerRequestsPage() {
  const { has } = useMe();
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [sf, setSf] = useState<any>({ text: '', category: 'other', visibility: 'pastoral' });
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api(`/api/v1/pastoral/prayers?status=${status}&pageSize=100`)
      .then((r: any) => setItems(r.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const manage = async (id: string, s: string) => {
    try {
      await api(`/api/v1/pastoral/prayers/${id}`, { method: 'PUT', body: { status: s } });
      load();
    } catch (e: any) { toast.error(errMessage(e)); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api('/api/v1/pastoral/prayers', { method: 'POST', body: sf });
      toast.success('Prayer request submitted.');
      setSubmitOpen(false);
      setSf({ text: '', category: 'other', visibility: 'pastoral' });
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Prayer requests" description="Visible per the submitter's chosen visibility level"
        crumbs={[{ label: 'Pastoral care' }, { label: 'Prayer requests' }]}
        actions={<Button variant="secondary" onClick={() => setSubmitOpen(true)}>+ Submit request</Button>} />

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-40">
          <option value="active">Active</option>
          <option value="prayed">Prayed</option>
          <option value="closed">Closed</option>
          <option value="">All</option>
        </Select>
        <p className="text-xs text-slate-400">Requests marked “private” are visible only to the submitter and pastors.</p>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : items.length === 0 ? (
        <Card><p className="text-sm text-slate-500">No prayer requests in this view.</p></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge color={r.visibility}>{r.visibility}</Badge>
                    <Badge color="none">{r.category}</Badge>
                    {r.anonymous && <Badge color="private">anonymous</Badge>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.text}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {r.submitted_by_name ?? r.member_name ?? 'Anonymous'} · {fmtDate(r.created_at)}
                  </p>
                </div>
                <Badge color={r.status}>{r.status}</Badge>
              </div>
              {has('prayer.manage') && r.status !== 'closed' && (
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  {r.status === 'active' && <Button size="sm" variant="secondary" onClick={() => manage(r.id, 'prayed')}>Mark prayed</Button>}
                  <Button size="sm" variant="ghost" onClick={() => manage(r.id, 'closed')}>Close</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* submit modal */}
      {submitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-lg p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Submit a prayer request</h2>
            <div className="space-y-4">
              <Field label="Request" required>
                <Textarea required value={sf.text} onChange={(e) => setSf((x: any) => ({ ...x, text: e.target.value }))} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <Select value={sf.category} onChange={(e) => setSf((x: any) => ({ ...x, category: e.target.value }))}>
                    {['health', 'family', 'financial', 'work', 'spiritual', 'gratitude', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Who should see this?">
                  <Select value={sf.visibility} onChange={(e) => setSf((x: any) => ({ ...x, visibility: e.target.value }))}>
                    <option value="private">Only me & pastoral team</option>
                    <option value="pastoral">Pastoral team</option>
                    <option value="church">Whole church (anonymized in public views)</option>
                  </Select>
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setSubmitOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={busy || sf.text.trim().length < 3}>{busy ? 'Submitting…' : 'Submit'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
