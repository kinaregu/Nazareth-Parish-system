'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Card, Field, Input, PageHeader, Select, Skeleton, useMe } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

const GROUPS: Record<string, string> = {
  membership: 'Membership',
  attendance: 'Attendance',
  events: 'Events',
  finance: 'Finance',
  pastoral: 'Pastoral',
};

export default function ReportsPage() {
  const { has } = useMe();
  const [defs, setDefs] = useState<any[]>([]);
  const [saved, setSaved] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    api('/api/v1/reports/definitions').then((r: any) => {
      const d = r.data ?? [];
      setDefs(d);
      if (d.length) setCode(d[0].code);
    }).catch(() => {});
    api('/api/v1/reports/saved').then((r: any) => setSaved(r.data ?? [])).catch(() => {});
  }, []);

  const def = useMemo(() => defs.find((d) => d.code === code), [defs, code]);

  const run = async (c?: string, f?: string, t?: string) => {
    const cc = c ?? code, ff = f ?? from, tt = t ?? to;
    setLoading(true);
    setResult(null);
    try {
      const sp = new URLSearchParams({ code: cc });
      if (ff) sp.set('from', ff);
      if (tt) sp.set('to', tt);
      const r = await api(`/api/v1/reports?${sp}`);
      setResult({ code: cc, from: ff, to: tt, data: r.data });
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const saveFilter = async () => {
    if (!saveName.trim()) return;
    try {
      const r = await api('/api/v1/reports/saved', { method: 'POST', body: { name: saveName, report_code: code, params: { from, to } } });
      setSaved((s) => [r.data, ...s]);
      setSaveOpen(false);
      setSaveName('');
      toast.success('Filter saved.');
    } catch (e: any) { toast.error(errMessage(e)); }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Reports" description="Centralized reporting with saved filters. Exports are audit-logged." />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="Report" className="lg:col-span-1">
          <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {Object.entries(GROUPS).map(([g, label]) => (
              <div key={g}>
                <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                {defs.filter((d) => d.group === g).map((d) => (
                  <button key={d.code} onClick={() => setCode(d.code)}
                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${code === d.code ? 'bg-primary-50 font-medium text-primary-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                    {d.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Card>

        <div className="lg:col-span-3">
          <Card title={def?.name ?? 'Choose a report'}>
            <div className="flex flex-wrap items-end gap-3">
              {def?.params.map((p: any) => (
                <Field key={p.key} label={p.label}>
                  <Input type={p.type === 'date' ? 'date' : 'text'} className="!w-44"
                    value={p.key === 'from' ? from : p.key === 'to' ? to : ''}
                    onChange={(e) => (p.key === 'from' ? setFrom(e.target.value) : setTo(e.target.value))} />
                </Field>
              ))}
              <Button onClick={() => run()} disabled={loading}>{loading ? 'Running…' : 'Run report'}</Button>
              {has('reports.manage') && <Button variant="secondary" onClick={() => setSaveOpen(true)}>Save filter</Button>}
              {has('reports.export') && !loading && (
                <div className="flex gap-1">
                  <a href={exportHref(code, from, to, 'csv')}><Button variant="secondary" size="sm">CSV</Button></a>
                  <a href={exportHref(code, from, to, 'xlsx')}><Button variant="secondary" size="sm">Excel</Button></a>
                  <a href={exportHref(code, from, to, 'pdf')}><Button variant="secondary" size="sm">PDF</Button></a>
                </div>
              )}
            </div>
            {def && <p className="mt-3 text-xs text-slate-400">{def.description}{def.sensitive ? ' · Sensitive report — access is logged.' : ''}</p>}

            {loading && <div className="mt-4 space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6" />)}</div>}

            {result?.data && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>{result.data.columns.map((c: string) => <th key={c} className="th">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.data.rows.map((r: any[], i: number) => (
                      <tr key={i} className="border-b border-slate-100">
                        {r.map((v, j) => <td key={j} className="td">{String(v ?? '—')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.data.rows.length > 200 && <p className="px-4 py-2 text-xs text-slate-400">Showing first 200 rows — export for the full dataset.</p>}
              </div>
            )}
          </Card>

          {saved.length > 0 && (
            <Card title="My saved filters" className="mt-4">
              <ul className="divide-y divide-slate-100">
                {saved.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <button className="text-sm text-primary-700 hover:underline" onClick={() => { setCode(s.report_code); setFrom(s.params?.from ?? ''); setTo(s.params?.to ?? ''); run(s.report_code, s.params?.from, s.params?.to); }}>
                      {s.name} <span className="text-xs text-slate-400">({defs.find((d) => d.code === s.report_code)?.name ?? s.report_code})</span>
                    </button>
                    <button className="text-xs text-red-500 hover:underline"
                      onClick={async () => { await api(`/api/v1/reports/saved?id=${s.id}`, { method: 'DELETE' }); setSaved((x) => x.filter((y) => y.id !== s.id)); }}>
                      delete
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {saveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-sm p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-800">Save this filter</h2>
            <Field label="Name" required><Input required value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Giving — this quarter" /></Field>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button>
              <Button onClick={saveFilter}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function exportHref(code: string, from: string, to: string, format: string) {
  const sp = new URLSearchParams({ code, format });
  if (from) sp.set('from', from);
  if (to) sp.set('to', to);
  return `/api/v1/reports/export?${sp}`;
}
