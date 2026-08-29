'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, useList } from '@/components/ui/data-table';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Skeleton, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

const ROLE_OPTIONS = ['super_admin', 'pastor', 'admin', 'finance', 'ministry_leader', 'group_leader', 'member'];

export default function UsersPage() {
  const { me, has } = useMe();
  const list = useList('/api/v1/users');
  const p = list.params;
  const [roles, setRoles] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [editFor, setEditFor] = useState<any>(null);
  const [u, setU] = useState<any>({ name: '', email: '', phone: '', branch_id: '', role_codes: ['admin'] });
  const [busy, setBusy] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);

  const loadMeta = () => {
    api('/api/v1/roles').then((r: any) => setRoles(r.data ?? [])).catch(() => {});
    api('/api/v1/branches').then((r: any) => setBranches(r.data ?? [])).catch(() => {});
  };

  const toggleRole = (code: string) =>
    setU((x: any) => ({ ...x, role_codes: x.role_codes.includes(code) ? x.role_codes.filter((r: string) => r !== code) : [...x.role_codes, code] }));

  const create = async () => {
    setBusy(true);
    try {
      const r = await api('/api/v1/users', { method: 'POST', body: u });
      setTempPw(r.data.tempPassword);
      toast.success('User created.');
      list.reload();
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editFor) return;
    setBusy(true);
    try {
      await api(`/api/v1/users/${editFor.id}`, { method: 'PUT', body: { role_codes: u.role_codes, branch_id: u.branch_id || null, active: u.active !== false } });
      toast.success('User updated.');
      setEditFor(null);
      list.reload();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const resetPw = async (id: string, name: string) => {
    if (!window.confirm(`Reset ${name}'s password? A temporary password will be shown once.`)) return;
    try {
      const r = await api(`/api/v1/users/${id}/reset-password`, { method: 'POST', body: {} });
      setTempPw(r.data.tempPassword);
      list.reload();
    } catch (e: any) { toast.error(errMessage(e)); }
  };

  const columns = [
    { key: 'name', label: 'Name', sortable: true, render: (r: any) => <span className="font-medium text-slate-800">{r.name}</span> },
    { key: 'email', label: 'Email', render: (r: any) => r.email },
    { key: 'roles', label: 'Roles', render: (r: any) => (
      <div className="flex flex-wrap gap-1">
        {(r.roles ?? []).map((x: any) => <Badge key={x.code} color="none">{x.code.replace('_', ' ')}</Badge>)}
      </div>
    )},
    { key: 'branch_name', label: 'Branch', render: (r: any) => r.branch_name ?? 'All' },
    { key: 'linked_member', label: 'Linked member', render: (r: any) => r.linked_member ?? '—' },
    { key: 'last_login_at', label: 'Last login', sortable: true, render: (r: any) => (r.last_login_at ? fmtDate(r.last_login_at, 'long') : 'Never') },
    { key: 'is_active', label: 'Status', render: (r: any) => <Badge color={r.is_active ? 'active' : 'inactive'}>{r.is_active ? 'active' : 'disabled'}</Badge> },
    {
      key: 'actions', label: '',
      render: (r: any) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={async () => {
            const detail = await api(`/api/v1/users/${r.id}`).catch(() => null);
            const data = detail?.data;
            setU({ name: r.name, email: r.email, phone: r.phone ?? '', branch_id: r.branch_id ?? '', role_codes: (data?.roles ?? []).map((x: any) => x.code), active: r.is_active });
            setEditFor({ id: r.id });
          }}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => resetPw(r.id, r.name)}>Reset pw</Button>
          {r.id !== me?.user.id && (
            <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => {
              if (!window.confirm(`Deactivate ${r.name}? They will be signed out.`)) return;
              try { await api(`/api/v1/users/${r.id}`, { method: 'DELETE' }); toast.success('User deactivated.'); list.reload(); } catch (e: any) { toast.error(errMessage(e)); }
            }}>Deactivate</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Users" description="System accounts and their roles"
        crumbs={[{ label: 'Administration' }, { label: 'Users' }]}
        actions={<Button onClick={() => { loadMeta(); setU({ name: '', email: '', phone: '', branch_id: '', role_codes: ['admin'] }); setNewOpen(true); }}>+ New user</Button>} />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Search"><Input placeholder="Name or email…" defaultValue={p.search ?? ''} onChange={(e) => list.setParam({ search: e.target.value })} className="!w-64" /></Field>
      </div>

      <DataTable
        columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} sort={list.sort} order={list.order} onSort={list.toggleSort} onPage={list.setPage}
        emptyTitle="No users" emptyMessage="Create the first staff account."
      />

      {/* create */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New user">
        <div className="space-y-4">
          {tempPw ? (
            <div role="alert" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-semibold">Temporary password (shown once):</p>
              <p className="mt-1 font-mono text-base">{tempPw}</p>
              <p className="mt-1 text-xs">The user must change it at first login. Send it by a secure channel.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required><Input required value={u.name} onChange={(e) => setU((x: any) => ({ ...x, name: e.target.value }))} /></Field>
                <Field label="Email" required><Input type="email" required value={u.email} onChange={(e) => setU((x: any) => ({ ...x, email: e.target.value }))} /></Field>
                <Field label="Phone"><Input value={u.phone} onChange={(e) => setU((x: any) => ({ ...x, phone: e.target.value }))} /></Field>
                <Field label="Branch">
                  <Select value={u.branch_id} onChange={(e) => setU((x: any) => ({ ...x, branch_id: e.target.value }))}>
                    <option value="">All branches</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Roles" required hint="A user can hold several roles; permissions are the union.">
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((r) => (
                    <label key={r} className="cursor-pointer">
                      <input type="checkbox" className="peer sr-only" checked={u.role_codes.includes(r)} onChange={() => toggleRole(r)} />
                      <span className="inline-block rounded-full border border-slate-300 px-3 py-1 text-xs capitalize text-slate-600 peer-checked:border-primary-500 peer-checked:bg-primary-50 peer-checked:text-primary-700">
                        {r.replace('_', ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setNewOpen(false)}>Close</Button>
                {!tempPw && <Button onClick={create} disabled={busy || !u.name || !u.email || u.role_codes.length === 0}>{busy ? 'Creating…' : 'Create user'}</Button>}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* edit roles */}
      <Modal open={!!editFor} onClose={() => setEditFor(null)} title={`Edit user — ${u.name}`}>
        <div className="space-y-4">
          <Field label="Branch">
            <Select value={u.branch_id ?? ''} onChange={(e) => setU((x: any) => ({ ...x, branch_id: e.target.value }))}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Roles" required>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => (
                <label key={r} className="cursor-pointer">
                  <input type="checkbox" className="peer sr-only" checked={u.role_codes.includes(r)} onChange={() => toggleRole(r)} />
                  <span className="inline-block rounded-full border border-slate-300 px-3 py-1 text-xs capitalize text-slate-600 peer-checked:border-primary-500 peer-checked:bg-primary-50 peer-checked:text-primary-700">
                    {r.replace('_', ' ')}
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={u.active !== false} onChange={(e) => setU((x: any) => ({ ...x, active: e.target.checked }))} className="h-4 w-4" />
            Account active
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditFor(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy || u.role_codes.length === 0}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
