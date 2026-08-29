'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Textarea, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtMoney } from '@/lib/client';

export default function FundsPage() {
  const { has } = useMe();
  const [funds, setFunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [f, setF] = useState<any>({ id: '', name: '', code: '', description: '', opening_balance: 0, is_active: true });
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);

  const load = () => {
    setLoading(true);
    api('/api/v1/funds').then((r: any) => setFunds(r.data ?? [])).catch(() => setFunds([])).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    api('/api/v1/branches').then((r: any) => setBranches(r.data ?? [])).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      if (f.id) {
        await api('/api/v1/funds', { method: 'PUT', body: { ...f, opening_balance: Number(f.opening_balance || 0) } });
      } else {
        await api('/api/v1/funds', { method: 'POST', body: { ...f, branch_id: f.branch_id || branches[0]?.id, opening_balance: Number(f.opening_balance || 0) } });
      }
      toast.success('Fund saved.');
      setEditOpen(false);
      load();
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const canManage = has('funds.manage');

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Funds" description="Tithes, offerings, building fund, missions…"
        crumbs={[{ label: 'Finance' }, { label: 'Funds' }]}
        actions={canManage ? <Button onClick={() => { setF({ name: '', code: '', description: '', opening_balance: 0, is_active: true, branch_id: branches[0]?.id }); setEditOpen(true); }}>+ New fund</Button> : undefined} />

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {funds.map((x) => (
            <Card key={x.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800">{x.name}</p>
                  <p className="font-mono text-xs text-slate-400">{x.code}</p>
                </div>
                <Badge color={x.is_active ? 'active' : 'inactive'}>{x.is_active ? 'active' : 'inactive'}</Badge>
              </div>
              {x.description && <p className="mt-2 text-xs text-slate-500">{x.description}</p>}
              <p className="mt-3 text-lg font-semibold text-primary-700">{fmtMoney(x.balance ?? x.opening_balance ?? 0)}</p>
              {canManage && (
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <Button size="sm" variant="secondary" onClick={() => { setF({ id: x.id, name: x.name, code: x.code, description: x.description ?? '', opening_balance: x.opening_balance ?? 0, is_active: x.is_active }); setEditOpen(true); }}>Edit</Button>
                </div>
              )}
            </Card>
          ))}
          {funds.length === 0 && <p className="text-sm text-slate-500">No funds yet.</p>}
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={f.id ? 'Edit fund' : 'New fund'}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required><Input required value={f.name} onChange={(e) => setF((p: any) => ({ ...p, name: e.target.value }))} /></Field>
            <Field label="Code" required hint="lowercase, e.g. building_fund">
              <Input required pattern="[a-z0-9_]+" value={f.code} disabled={!!f.id} onChange={(e) => setF((p: any) => ({ ...p, code: e.target.value.toLowerCase() }))} />
            </Field>
            <Field label="Opening balance"><Input type="number" step="0.01" value={f.opening_balance} onChange={(e) => setF((p: any) => ({ ...p, opening_balance: e.target.value }))} /></Field>
            {!f.id && (
              <Field label="Branch">
                <Select value={f.branch_id ?? ''} onChange={(e) => setF((p: any) => ({ ...p, branch_id: e.target.value }))}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <Field label="Description"><Textarea value={f.description} onChange={(e) => setF((p: any) => ({ ...p, description: e.target.value }))} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save fund'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
