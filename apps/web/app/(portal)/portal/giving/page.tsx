'use client';

import { useEffect, useState } from 'react';
import { Card, Field, Input, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, fmtDate, fmtMoney } from '@/lib/client';

export default function PortalGivingPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const sp = new URLSearchParams();
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    api(`/api/v1/portal/giving?${sp}`)
      .then((r: any) => setData({ data: r.data, sum: r.sum }))
      .catch((e: any) => setErr(e.message));
  }, [from, to]);

  if (err) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <PageHeader title="My giving" crumbs={[{ label: 'My Life at Church' }, { label: 'Giving' }]} />
        <Card><p className="text-sm text-slate-500">{err}</p></Card>
      </div>
    );
  }
  if (!data) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-72" /></div>;

  const rows: any[] = data.data ?? [];
  const total = data.sum ?? rows.reduce((s: number, r: any) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My giving" description="Your personal giving history (opt-in)"
        crumbs={[{ label: 'My Life at Church' }, { label: 'Giving' }]} />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="ml-auto text-right">
          <p className="text-xs uppercase text-slate-400">Total (shown range)</p>
          <p className="text-xl font-semibold text-primary-700">{fmtMoney(total)}</p>
        </div>
      </div>

      <Card title="History">
        {rows.length === 0 ? <p className="text-sm text-slate-500">No giving recorded for this period.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left"><th className="th">Date</th><th className="th">Fund</th><th className="th">Method</th><th className="th">Receipt</th><th className="th text-right">Amount</th></tr></thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id} className="border-b border-slate-100">
                  <td className="td">{fmtDate(g.tx_date)}</td>
                  <td className="td">{g.fund_name}</td>
                  <td className="td capitalize">{g.method}</td>
                  <td className="td">
                    {g.receipt_no ? (
                      <a href={`/api/v1/giving/${g.id}/receipt`} className="font-mono text-xs text-primary-600 hover:underline">{g.receipt_no} (PDF)</a>
                    ) : '—'}
                  </td>
                  <td className="td text-right font-medium">{fmtMoney(g.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
