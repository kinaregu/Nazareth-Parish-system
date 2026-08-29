'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

const VARS = ['name', 'date', 'event', 'receipt', 'amount', 'fund', 'password'];

export default function TemplatesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api('/api/v1/templates').then((r: any) => setItems(r.data ?? [])).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api('/api/v1/templates', {
        method: 'PUT',
        body: { code: editing.code, name: editing.name, channel: editing.channel, subject: editing.subject, body: editing.body, is_active: editing.is_active },
      });
      toast.success('Template saved.');
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Message templates" description="Reusable templates for email/SMS/in-app messages. Variables: "
        crumbs={[{ label: 'Communication' }, { label: 'Templates' }]} />
      <p className="-mt-2 text-xs text-slate-400">
        {VARS.map((v) => <code key={v} className="mr-1 rounded bg-slate-100 px-1">{'{{' + v + '}}'}</code>)}
      </p>

      <div className="grid gap-3">
        {items.map((t) => (
          <Card key={t.id}
            title={<span>{t.name} <span className="ml-2 font-mono text-xs text-slate-400">{t.code}</span></span>}
            actions={
              <div className="flex items-center gap-2">
                <Badge color={t.is_active ? 'active' : 'inactive'}>{t.is_active ? 'active' : 'inactive'}</Badge>
                <span className="text-xs text-slate-400">{t.channel}</span>
                <Button size="sm" variant="secondary" onClick={() => setEditing({ ...t })}>Edit</Button>
              </div>
            }>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{t.body}</p>
          </Card>
        ))}
        {items.length === 0 && <Card><p className="text-sm text-slate-500">No templates yet.</p></Card>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Edit template — {editing.code}</h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Channel">
                  <Select value={editing.channel} onChange={(e) => setEditing((p: any) => ({ ...p, channel: e.target.value }))}>
                    <option value="email">email</option><option value="sms">sms</option><option value="in_app">in_app</option>
                  </Select>
                </Field>
                <Field label="Active">
                  <Select value={editing.is_active ? '1' : '0'} onChange={(e) => setEditing((p: any) => ({ ...p, is_active: e.target.value === '1' }))}>
                    <option value="1">Active</option><option value="0">Inactive</option>
                  </Select>
                </Field>
              </div>
              {editing.channel === 'email' && (
                <Field label="Subject"><Input value={editing.subject} onChange={(e) => setEditing((p: any) => ({ ...p, subject: e.target.value }))} /></Field>
              )}
              <Field label="Body"><Textarea className="min-h-[180px]" value={editing.body} onChange={(e) => setEditing((p: any) => ({ ...p, body: e.target.value }))} /></Field>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save template'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
