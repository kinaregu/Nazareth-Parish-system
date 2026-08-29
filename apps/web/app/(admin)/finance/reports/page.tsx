'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Button, Card, PageHeader, Skeleton, useMe } from '@/components/ui/primitives';
import { api, fmtMoney } from '@/lib/client';

export default function FinanceReportsPage() {
  const { has } = useMe();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api('/api/v1/reports?code=income_vs_expenses').then((r: any) => r.data).catch(() => null),
      api('/api/v1/reports?code=giving_by_fund').then((r: any) => r.data).catch(() => null),
      api('/api/v1/reports?code=expenses_by_category').then((r: any) => r.data).catch(() => null),
    ]).then(([trend, byFund, byCat]) => setData({ trend, byFund, byCat })).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-80" /><Skeleton className="h-72" /><Skeleton className="h-64" /></div>;

  const trendRaw = (data.trend?.rows ?? []) as any[][];
  const byFundRaw = (data.byFund?.rows ?? []) as any[][];
  const byCatRaw = (data.byCat?.rows ?? []) as any[][];
  const trendRows = trendRaw.map((r) => ({ month: r[0], income: Number(r[1]), expenses: Number(r[2]), net: Number(r[3]) }));
  const byFund = byFundRaw.map((r) => ({ name: r[0], total: Number(r[2]), tx: r[1] }));
  const byCat = byCatRaw.map((r) => ({ name: r[0], total: Number(r[2]), count: r[1] }));
  const ytdIncome = trendRows.reduce((s: number, r) => s + r.income, 0);
  const ytdExpenses = trendRows.reduce((s: number, r) => s + r.expenses, 0);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Financial reports"
        description={`12-month income vs expenses · totals in ${has('finance.view') ? '' : ''}`}
        crumbs={[{ label: 'Finance' }, { label: 'Reports' }]}
        actions={has('reports.export') ? (
          <div className="flex gap-2">
            <a href="/api/v1/reports/export?code=income_vs_expenses&format=xlsx"><Button size="sm" variant="secondary">Download XLSX</Button></a>
            <a href="/api/v1/reports/export?code=income_vs_expenses&format=pdf"><Button size="sm" variant="secondary">PDF</Button></a>
          </div>
        ) : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><p className="text-xs uppercase text-slate-400">Income (12 mo)</p><p className="text-2xl font-semibold text-emerald-600">{fmtMoney(ytdIncome)}</p></Card>
        <Card><p className="text-xs uppercase text-slate-400">Expenses (12 mo)</p><p className="text-2xl font-semibold text-red-600">{fmtMoney(ytdExpenses)}</p></Card>
        <Card><p className="text-xs uppercase text-slate-400">Net</p><p className={`text-2xl font-semibold ${ytdIncome - ytdExpenses >= 0 ? 'text-primary-700' : 'text-red-600'}`}>{fmtMoney(ytdIncome - ytdExpenses)}</p></Card>
      </div>

      <Card title="Income vs expenses — monthly (12 months)">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} />
              <Bar dataKey="income" name="Income" fill="#1b3a6b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#c9a227" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Giving by fund (12 months)">
          {byFund.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : (
            <ul className="divide-y divide-slate-100">
              {byFund.map((x) => (
                <li key={x.name} className="flex items-center justify-between py-2 text-sm">
                  <span>{x.name} <span className="text-xs text-slate-400">({x.tx} tx)</span></span>
                  <span className="font-medium">{fmtMoney(x.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Expenses by category (12 months)">
          {byCat.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : (
            <ul className="divide-y divide-slate-100">
              {byCat.map((x) => (
                <li key={x.name} className="flex items-center justify-between py-2 text-sm">
                  <span>{x.name} <span className="text-xs text-slate-400">({x.count})</span></span>
                  <span className="font-medium">{fmtMoney(x.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
