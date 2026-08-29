'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function BackupsPage() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api('/api/v1/backups').then((r: any) => setBackups(r.data ?? [])).catch(() => setBackups([])).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const runNow = async () => {
    setBusy(true);
    try {
      const r = await api('/api/v1/backups', { method: 'POST', body: {} });
      toast.success('Backup completed.');
      load();
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Backups" description="Automated daily backups of the database (retention: 7 days). Manual backups run on demand."
        crumbs={[{ label: 'Administration' }, { label: 'Backups' }]}
        actions={<Button onClick={runNow} disabled={busy}>{busy ? 'Backing up…' : 'Run backup now'}</Button>} />

      {loading ? <Skeleton className="h-64" /> : (
        <Card title={`Backup log (${backups.length})`}>
          {backups.length === 0 ? <p className="text-sm text-slate-500">No backups yet — run the first one.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left"><th className="th">Created</th><th className="th">File</th><th className="th">Size</th><th className="th">Trigger</th><th className="th">Status</th></tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100">
                    <td className="td">{fmtDate(b.created_at, 'long')}</td>
                    <td className="td font-mono text-xs">{b.file}</td>
                    <td className="td">{b.size_bytes ? `${(b.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}</td>
                    <td className="td">{b.trigger ?? 'scheduled'}</td>
                    <td className="td"><Badge color={b.status === 'success' ? 'active' : 'rejected'}>{b.status ?? 'success'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <p className="text-xs text-slate-400">
        Restore procedure: stop the app, restore the latest dump into PostgreSQL, then run <code className="rounded bg-slate-100 px-1">npm run db:migrate</code> — see docs/BACKUP-RESTORE.md.
      </p>
    </div>
  );
}
