'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Textarea, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function FollowupsPage() {
  const { has, me } = useMe();
  const list = useList('/api/v1/pastoral/followups');
  const p = list.params;
  const [newOpen, setNewOpen] = useState(false);
  const [f, setF] = useState<any>({ reason: '', due_date: '', priority: 'normal', assigned_to: '', member_id: '' });
  const [members, setMembers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setF({ reason: '', due_date: new Date().toISOString().slice(0, 10), priority: 'normal', assigned_to: '', member_id: '' });
    setNewOpen(true);
  };

  const create = async () => {
    setBusy(true);
    try {
      await api('/api/v1/pastoral/followups', {
        method: 'POST',
        body: {
          subject_type: 'manual',
          subject_id: crypto.randomUUID(),
          member_id: f.member_id || undefined,
          reason: f.reason,
          assigned_to: f.assigned_to || me?.scope.linkedMemberId || me?.user.id,
          due_date: f.due_date,
          priority: f.priority,
        },
      });
      toast.success('Follow-up created.');
      setNewOpen(false);
      list.reload();
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'member_name', label: 'Member', render: (r: any) => r.member_name ?? 'General' },
    { key: 'reason', label: 'Reason', render: (r: any) => <span className="line-clamp-1 max-w-[280px]">{r.reason}</span> },
    { key: 'priority', label: 'Priority', render: (r: any) => <Badge color={r.priority}>{r.priority}</Badge> },
    {
      key: 'due_date', label: 'Due', sortable: true,
      render: (r: any) => (
        <span className={r.status !== 'completed' && r.status !== 'cancelled' && new Date(r.due_date) < new Date() ? 'font-medium text-red-600' : ''}>
          {fmtDate(r.due_date)}
        </span>
      ),
    },
    { key: 'assigned_to_name', label: 'Assigned', render: (r: any) => r.assigned_to_name ?? '—' },
    { key: 'status', label: 'Status', render: (r: any) => <Badge color={r.status}>{r.status}</Badge> },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Follow-ups" description="Generic follow-up tasks with contact history (visitors, absences, cases, manual)"
        crumbs={[{ label: 'Pastoral care' }, { label: 'Follow-ups' }]}
        actions={has('followups.create') ? <Button onClick={openNew}>+ New follow-up</Button> : undefined} />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Status">
          <Select value={p.status ?? ''} className="w-44" onChange={(e) => list.setParam({ status: e.target.value })}>
            <option value="">All</option><option value="pending">Pending</option><option value="in_progress">In progress</option>
            <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={p.priority ?? ''} className="w-36" onChange={(e) => list.setParam({ priority: e.target.value })}>
            <option value="">All</option><option value="low">Low</option><option value="normal">Normal</option>
            <option value="high">High</option><option value="urgent">Urgent</option>
          </Select>
        </Field>
        <Field label="Only mine">
          <Select value={p.mine ?? ''} className="w-32" onChange={(e) => list.setParam({ mine: e.target.value === 'true' ? 'true' : undefined })}>
            <option value="">All</option><option value="true">Mine</option>
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        rowActions={(r: any) => (
          r.status === 'pending' || r.status === 'in_progress' ? (
            <Button size="sm" variant="secondary" onClick={async () => {
              const outcome = window.prompt('Outcome of this follow-up:');
              if (outcome === null) return;
              try {
                await api(`/api/v1/pastoral/followups/${r.id}`, { method: 'PUT', body: { status: 'completed', outcome: outcome || undefined } });
                toast.success('Follow-up completed.');
                list.reload();
              } catch (e: any) { toast.error(errMessage(e)); }
            }}>Complete</Button>
          ) : null
        )}
        emptyTitle="No follow-ups" emptyMessage="Create a follow-up, or let the attendance workflow generate them."
      />

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New follow-up">
        <div className="space-y-4">
          <Field label="Reason" required><Textarea required value={f.reason} onChange={(e) => setF((x: any) => ({ ...x, reason: e.target.value }))} placeholder="e.g. 2-week absence — call to check in" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Due date" required><Input type="date" required value={f.due_date} onChange={(e) => setF((x: any) => ({ ...x, due_date: e.target.value }))} /></Field>
            <Field label="Priority">
              <Select value={f.priority} onChange={(e) => setF((x: any) => ({ ...x, priority: e.target.value }))}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !f.reason.trim()}>{busy ? 'Creating…' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
