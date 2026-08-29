'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, fmtDate } from '@/lib/client';

/**
 * Dev outbox — in development (no SMTP configured) outgoing email is stored
 * here so password-reset links and notifications can be inspected.
 */
export default function OutboxPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api('/api/v1/outbox').then((r: any) => setItems(r.data ?? [])).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Dev outbox" description="Outgoing email captured in development (SMTP not configured). Hidden in production."
        crumbs={[{ label: 'Administration' }, { label: 'Dev outbox' }]}
        actions={<Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Refresh</Button>} />

      {items.length === 0 ? (
        <Card><p className="text-sm text-slate-500">Nothing in the outbox. Password resets, receipts and notifications will land here.</p></Card>
      ) : (
        <div className="card divide-y divide-slate-100">
          {items.map((m) => (
            <div key={m.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{m.subject}</p>
                  <p className="text-xs text-slate-500">to {m.to_address} · {fmtDate(m.created_at, 'long')}</p>
                </div>
                <Badge color="none">email</Badge>
              </div>
              {open === m.id && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{m.body}</pre>}
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(open === m.id ? null : m.id)}>
                {open === m.id ? 'Hide body' : 'Show body'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
