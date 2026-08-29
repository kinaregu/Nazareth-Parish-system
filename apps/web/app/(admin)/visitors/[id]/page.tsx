'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function VisitorDetailPage({ params }: { params: { id: string } }) {
  const { has } = useMe();
  const [v, setV] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convert, setConvert] = useState<any>({ status: 'new_member', branch_id: '' });
  const [followupOpen, setFollowupOpen] = useState(false);
  const [fu, setFu] = useState<any>({ note: '', outcome: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`/api/v1/visitors/${params.id}`).then((r: any) => setV(r.data)).catch(() => setV({}));
  }, [params.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/api/v1/branches').then((r: any) => setBranches(r.data ?? [])).catch(() => {}); }, []);

  const doConvert = async () => {
    if (!convert.branch_id) { toast.error('Choose a branch.'); return; }
    setBusy(true);
    try {
      const r = await api(`/api/v1/visitors/${v.id}/convert`, { method: 'POST', body: convert });
      toast.success(`Converted to member ${r.data.member_no}. Their visit history is preserved.`);
      setConvertOpen(false);
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const doFollowup = async () => {
    setBusy(true);
    try {
      await api(`/api/v1/visitors/${v.id}`, { method: 'POST', body: fu });
      toast.success('Follow-up recorded.');
      setFollowupOpen(false);
      setFu({ note: '', outcome: '' });
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  if (!v) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-48" /></div>;
  if (!v.id) return <div className="p-6 text-sm text-red-600">Visitor not found.</div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title={`${v.first_name} ${v.last_name}`}
        description={`First visit ${fmtDate(v.visit_date)}${v.service_name ? ` · ${v.service_name}` : ''} · ${v.branch_name ?? ''}`}
        crumbs={[{ label: 'Visitors', href: '/visitors' }, { label: `${v.first_name} ${v.last_name}` }]}
        actions={
          <>
            <Badge color={v.followup_status}>{v.followup_status}</Badge>
            {v.converted_member_id ? (
              <Link href={`/members/${v.converted_member_id}`}><Badge color="converted">view member profile →</Badge></Link>
            ) : (
              has('visitors.convert') && <Button size="sm" onClick={() => setConvertOpen(true)}>Convert to member</Button>
            )}
            {has('visitors.edit') && !v.converted_member_id && (
              <Button size="sm" variant="secondary" onClick={() => setFollowupOpen(true)}>Record follow-up</Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Contact">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[['Phone', v.phone], ['Email', v.email], ['Preferred name', v.preferred_name],
              ['How they heard', v.heard_from], ['Previous church', v.previous_church], ['Assigned to', v.assigned_to_name]].map(([k, val]) => (
              <div key={k as string}>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-slate-800 capitalize">{val || '—'}</dd>
              </div>
            ))}
          </dl>
          {v.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{v.notes}</p>}
        </Card>

        <Card title="Follow-up history">
          {(v.followups ?? []).length === 0 ? <p className="text-sm text-slate-500">No follow-ups recorded yet.</p> : (
            <ol className="relative ml-3 space-y-4 border-l border-slate-200 pl-5">
              {(v.followups ?? []).map((x: any, i: number) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-gold-400" aria-hidden />
                  <p className="text-sm text-slate-800">{x.note}</p>
                  {x.outcome && <p className="text-xs text-slate-500">Outcome: {x.outcome}</p>}
                  <p className="text-xs text-slate-400">{fmtDate(x.created_at)} · {x.created_by_name ?? 'staff'}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} title="Convert visitor to member">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This creates a member record for <strong>{v.first_name} {v.last_name}</strong> and copies their contact details.
            Visit history stays linked to this visitor record.
          </p>
          <Field label="Branch" required>
            <Select value={convert.branch_id} onChange={(e) => setConvert((p: any) => ({ ...p, branch_id: e.target.value }))}>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Initial member status">
            <Select value={convert.status} onChange={(e) => setConvert((p: any) => ({ ...p, status: e.target.value }))}>
              <option value="new_member">New member</option>
              <option value="active">Active</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button onClick={doConvert} disabled={busy}>{busy ? 'Converting…' : 'Convert to member'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={followupOpen} onClose={() => setFollowupOpen(false)} title="Record follow-up contact">
        <div className="space-y-4">
          <Field label="What happened?" required>
            <Textarea required value={fu.note} onChange={(e) => setFu((p: any) => ({ ...p, note: e.target.value }))} placeholder="Called, met at church, visited at home…" />
          </Field>
          <Field label="Outcome (optional)">
            <Input value={fu.outcome} onChange={(e) => setFu((p: any) => ({ ...p, outcome: e.target.value }))} placeholder="e.g. will return next Sunday" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFollowupOpen(false)}>Cancel</Button>
            <Button onClick={doFollowup} disabled={busy || !fu.note}>{busy ? 'Saving…' : 'Save follow-up'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
