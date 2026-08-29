'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Card, Field, Input, PageHeader, Select, Skeleton, useMe } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

const TIMEZONES = ['Africa/Juba', 'Africa/Kampala', 'Africa/Lagos', 'Africa/Nairobi', 'UTC'];
const CURRENCIES = ['SSP', 'USD', 'EUR', 'GBP', 'UGX', 'KES'];

export default function SettingsPage() {
  const { has } = useMe();
  const [org, setOrg] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>({});
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF((p: any) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    api('/api/v1/settings').then((r: any) => {
      const d = r.data;
      setOrg(d);
      setF({
        name: d.name ?? '', address: d.address ?? '', city: d.city ?? '', country: d.country ?? '',
        phone: d.phone ?? '', email: d.email ?? '', website: d.website ?? '',
        default_currency: d.default_currency ?? 'SSP', timezone: d.timezone ?? 'Africa/Juba',
        default_language: d.default_language ?? 'en',
      });
    }).catch(() => setOrg({}));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const s = org?.settings ?? {};
      await api('/api/v1/settings', { method: 'PUT', body: { ...f, settings: s } });
      toast.success('Settings saved.');
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleSetting = async (key: string, value: boolean) => {
    setBusy(true);
    try {
      await api('/api/v1/settings', { method: 'PUT', body: { settings: { ...org.settings, [key]: value } } });
      setOrg((o: any) => ({ ...o, settings: { ...o.settings, [key]: value } }));
      toast.success('Saved.');
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!org || !org.id) {
    return has('settings.manage') ? <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-96" /></div>
      : <div className="p-6 text-sm text-slate-500">You need settings permission to view this page.</div>;
  }

  const s = org.settings ?? {};

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Church settings" description="Identity, localization defaults and behavior flags"
        crumbs={[{ label: 'Administration' }, { label: 'Settings' }]}
        actions={<Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Church identity">
          <div className="space-y-4">
            <Field label="Name" required><Input required value={f.name} onChange={set('name')} /></Field>
            <Field label="Address"><Input value={f.address} onChange={set('address')} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
              <Field label="Country"><Input value={f.country} onChange={set('country')} /></Field>
              <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
              <Field label="Website"><Input value={f.website} onChange={set('website')} /></Field>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Localization">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Currency">
                <Select value={f.default_currency} onChange={set('default_currency')}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Time zone">
                <Select value={f.timezone} onChange={set('timezone')}>
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="Language">
                <Select value={f.default_language} onChange={set('default_language')}>
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                  <option value="fa">Dholuo / local (coming)</option>
                </Select>
              </Field>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Dates and money are rendered from these values; the UI scaffold supports per-language string files under packages/shared/src/messages.
            </p>
          </Card>

          <Card title="Behavior flags">
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between">
                <span>Members may view their own giving history</span>
                <input type="checkbox" checked={Boolean(s.member_self_view_giving)} disabled={busy}
                  onChange={(e) => toggleSetting('member_self_view_giving', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
              </label>
              <label className="flex items-center justify-between">
                <span>Allow public self-registration</span>
                <input type="checkbox" checked={s.allow_public_registration !== false} disabled={busy}
                  onChange={(e) => toggleSetting('allow_public_registration', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
              </label>
              <label className="flex items-center justify-between">
                <span>Absence follow-up at 2 weeks</span>
                <input type="checkbox" checked={s.absence_followup !== false} disabled={busy}
                  onChange={(e) => toggleSetting('absence_followup', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
              </label>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
