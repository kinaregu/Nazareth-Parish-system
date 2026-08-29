'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Button, Modal, PageHeader, Textarea } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function RegistrationsPage() {
  const list = useList('/api/v1/members/registrations');
  const [review, setReview] = useState<{ id: string; name: string; decision: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async () => {
    if (!review) return;
    setBusy(true);
    try {
      const r = await api(`/api/v1/members/registrations/${review.id}/review`, {
        method: 'POST',
        body: { decision: review.decision, note: note || undefined },
      });
      toast.success(review.decision === 'approve' ? `Member created: ${r.data.member_name}` : 'Registration rejected.');
      setReview(null); setNote('');
      list.reload();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'first_name', label: 'Name', render: (r: any) => <span className="font-medium text-slate-800">{r.first_name} {r.last_name}</span> },
    { key: 'phone', label: 'Phone', render: (r: any) => r.phone ?? '—' },
    { key: 'email', label: 'Email', render: (r: any) => r.email ?? '—' },
    { key: 'heard_from', label: 'Heard from', render: (r: any) => <span className="capitalize">{r.heard_from ?? '—'}</span> },
    { key: 'created_at', label: 'Submitted', sortable: true, render: (r: any) => fmtDate(r.created_at) },
    { key: 'status', label: 'Status', render: (r: any) => <Badge color={r.status}>{r.status}</Badge> },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Member registrations" description="Public self-registration submissions awaiting review."
        crumbs={[{ label: 'Members', href: '/members' }, { label: 'Registrations' }]} />

      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        rowActions={(r: any) => r.status === 'pending' ? (
          <>
            <Button size="sm" onClick={() => { setReview({ id: r.id, name: `${r.first_name} ${r.last_name}`, decision: 'approve' }); setNote(''); }}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => { setReview({ id: r.id, name: `${r.first_name} ${r.last_name}`, decision: 'reject' }); setNote(''); }}>Reject</Button>
          </>
        ) : null}
        emptyTitle="No registrations" emptyMessage="New self-registrations will appear here for review."
      />

      <Modal open={!!review} onClose={() => setReview(null)} title={review?.decision === 'approve' ? 'Approve registration' : 'Reject registration'}>
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            {review?.decision === 'approve'
              ? <>Approving <strong>{review?.name}</strong> creates a member record (status: new member) and emails the person their portal login.</>
              : <>Reject <strong>{review?.name}</strong>? The submission is kept for the record.</>}
          </p>
          <Textarea placeholder="Optional note (included in the notification)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReview(null)}>Cancel</Button>
            <Button variant={review?.decision === 'reject' ? 'danger' : 'primary'} onClick={decide} disabled={busy}>
              {busy ? 'Working…' : review?.decision === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
