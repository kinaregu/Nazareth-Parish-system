'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Card, Field, Input, PageHeader, Skeleton, useMe } from '@/components/ui/primitives';
import { api, errMessage, fmtDate } from '@/lib/client';

export default function PortalProfilePage() {
  const { me, has } = useMe();
  const [p, setP] = useState<any>(null);
  const [f, setF] = useState<any>({});
  const [pw, setPw] = useState<any>({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/v1/profile').then((r: any) => {
    setP(r.data);
    setF({ name: r.data.user?.name ?? '', phone: r.data.user?.phone ?? '' });
  }).catch(() => setP({}));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api('/api/v1/profile', { method: 'PUT', body: f });
      toast.success('Profile updated.');
      load();
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const changePw = async () => {
    if (pw.next !== pw.confirm) { toast.error('New passwords do not match.'); return; }
    setBusy(true);
    try {
      await api('/api/v1/auth/change-password', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } });
      toast.success('Password changed.');
      setPw({ current: '', next: '', confirm: '' });
    } catch (e: any) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  const verifyEmail = async () => {
    try {
      await api('/api/v1/auth/verify-email', { method: 'POST', body: {} });
      toast.success('Verification link sent to your email.');
    } catch (e: any) { toast.error(errMessage(e)); }
  };

  if (!p) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;

  const m = p.member;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My profile" description={me?.user?.email} crumbs={[{ label: 'My Life at Church' }, { label: 'Profile' }]} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Account">
          <div className="space-y-4">
            <Field label="Full name"><Input value={f.name} onChange={(e) => setF((x: any) => ({ ...x, name: e.target.value }))} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => setF((x: any) => ({ ...x, phone: e.target.value }))} /></Field>
            <Field label="Email">
              <div className="flex items-center gap-2">
                <Input value={me?.user?.email ?? ''} disabled className="opacity-60" />
                {!me?.user?.email_verified_at && (
                  <Button size="sm" variant="secondary" onClick={verifyEmail}>Verify</Button>
                )}
              </div>
            </Field>
            <Button onClick={save} disabled={busy}>Save profile</Button>
          </div>
        </Card>

        {m ? (
          <Card title="My member record">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['Member no.', m.member_no], ['Status', m.status],
                ['Date of birth', m.date_of_birth ? fmtDate(m.date_of_birth) : '—'],
                ['Joined', m.date_joined ? fmtDate(m.date_joined) : '—'],
                ['Branch / city', m.city], ['Family', m.family_name],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="capitalize text-slate-800">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-slate-400">
              To correct your member details, contact the church office — your portal account is linked to member record <strong>{m.member_no}</strong>.
            </p>
          </Card>
        ) : (
          <Card title="Member record">
            <p className="text-sm text-slate-500">
              No member profile is linked to your account yet. If you are a member, contact the church office to link your account.
            </p>
          </Card>
        )}
      </div>

      <Card title="Change password">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password" required><Input type="password" required value={pw.current} onChange={(e) => setPw((x: any) => ({ ...x, current: e.target.value }))} /></Field>
          <Field label="New password" required hint="Min 8 chars, letter + number"><Input type="password" required value={pw.next} onChange={(e) => setPw((x: any) => ({ ...x, next: e.target.value }))} /></Field>
          <Field label="Confirm new password" required><Input type="password" required value={pw.confirm} onChange={(e) => setPw((x: any) => ({ ...x, confirm: e.target.value }))} /></Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={changePw} disabled={busy || !pw.current || pw.next.length < 8}>Change password</Button>
        </div>
      </Card>
    </div>
  );
}
