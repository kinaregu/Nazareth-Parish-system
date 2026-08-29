'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, Card, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

type Step = 'upload' | 'preview' | 'done';

export default function ImportMembersPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<any>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadBranches = async () => {
    const r = await api('/api/v1/branches').catch(() => null);
    const data = r?.data ?? [];
    setBranches(data);
    if (data.length === 1) setBranchId(data[0].id);
  };

  const upload = async () => {
    if (!file || !branchId) { toast.error('Choose a CSV file and a branch.'); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('branch_id', branchId);
      const r = await api('/api/v1/members/import', { method: 'POST', body: form, file: true });
      setPreview(r.data);
      setSkipped(new Set(r.data.rows.filter((x: any) => x.error || x.duplicate).map((x: any) => x.index)));
      setStep('preview');
    } catch (e: any) {
      toast.error(errMessage(e, 'Upload failed.'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const rows = preview.rows.filter((r: any) => !skipped.has(r.index));
    setBusy(true);
    try {
      const r = await api('/api/v1/members/import/confirm', {
        method: 'POST',
        body: { branch_id: branchId, rows },
      });
      setReport(r.data);
      setStep('done');
    } catch (e: any) {
      toast.error(errMessage(e, 'Import failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Import members" description="Upload a CSV file. Preview, review duplicates, then confirm — nothing is saved until you confirm."
        crumbs={[{ label: 'Members', href: '/members' }, { label: 'Import' }]} />

      {step === 'upload' && (
        <Card title="Step 1 — upload CSV">
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Columns: <code className="rounded bg-slate-100 px-1">first_name, last_name</code> (required) and any of
              <code className="rounded bg-slate-100 px-1"> middle_name, gender, dob, phone, email, address, city, status, date_joined</code>.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target branch" required>
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={branches.length <= 1}>
                  <option value="">Select…</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="CSV file" required>
                <input ref={inputRef} type="file" accept=".csv,text/csv" className="input !py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-700"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Link href="/members"><Button variant="secondary">Cancel</Button></Link>
              <Button onClick={() => { loadBranches().then(upload); }} disabled={busy || !file || !branchId}>{busy ? 'Parsing…' : 'Upload & preview'}</Button>
            </div>
          </div>
        </Card>
      )}

      {step === 'preview' && preview && (
        <Card title={`Step 2 — review (${preview.total} rows, ${preview.invalid} invalid)`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-slate-500">
              Unchecked rows will be skipped. Rows flagged with a duplicate are kept out by default — tick them to import anyway (email duplicates are still rejected server-side).
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setSkipped(new Set()); }}>Select all</Button>
              <Button size="sm" variant="secondary" onClick={() => setSkipped(new Set(preview.rows.map((r: any) => r.index)))}>Skip all</Button>
            </div>
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th w-10"><span aria-hidden>✓</span></th>
                  <th className="th">Row</th><th className="th">Name</th><th className="th">Phone</th>
                  <th className="th">Email</th><th className="th">Problem</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r: any) => (
                  <tr key={r.index} className="border-b border-slate-100">
                    <td className="td">
                      <input type="checkbox" checked={!skipped.has(r.index)} aria-label={`Include row ${r.index + 2}`}
                        onChange={(e) => {
                          const next = new Set(skipped);
                          if (e.target.checked) next.delete(r.index); else next.add(r.index);
                          setSkipped(next);
                        }} />
                    </td>
                    <td className="td text-slate-400">{r.index + 2}</td>
                    <td className="td">{r.first_name} {r.last_name}</td>
                    <td className="td">{r.phone || '—'}</td>
                    <td className="td">{r.email || '—'}</td>
                    <td className="td">
                      {r.error ? <span className="text-xs text-red-600">{r.error}</span>
                        : r.duplicate ? <span className="text-xs text-amber-700">Duplicate: {r.duplicate.name} ({r.duplicate.matched_on})</span>
                        : <span className="text-xs text-emerald-600">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep('upload')}>← Back</Button>
            <Button onClick={confirm} disabled={busy || preview.rows.filter((r: any) => !skipped.has(r.index)).length === 0}>
              {busy ? 'Importing…' : `Import ${preview.rows.filter((r: any) => !skipped.has(r.index)).length} rows`}
            </Button>
          </div>
        </Card>
      )}

      {step === 'done' && report && (
        <Card title="Step 3 — import report">
          <div className="space-y-2 text-sm">
            <p><span className="font-semibold text-emerald-700">{report.imported}</span> members imported.</p>
            {report.skipped > 0 && <p><span className="font-semibold text-amber-700">{report.skipped}</span> rows skipped (duplicate email or invalid).</p>}
            {report.errors?.length > 0 && (
              <ul className="list-inside list-disc text-xs text-red-600">
                {report.errors.slice(0, 20).map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            )}
            <div className="flex justify-end gap-2 pt-3">
              <Link href="/members"><Button>View members</Button></Link>
              <Button variant="secondary" onClick={() => { setStep('upload'); setPreview(null); setReport(null); setFile(null); if (inputRef.current) inputRef.current.value = ''; }}>
                Import another file
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
