'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Card, Field, Input, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, errMessage } from '@/lib/client';

const PREF_ROWS = [
  ['email_announcements', 'Email — announcements'],
  ['email_events', 'Email — events'],
  ['email_groups', 'Email — group news'],
  ['sms_events', 'SMS — event reminders'],
  ['sms_followup', 'SMS — follow-up messages'],
] as const;

export default function PortalSettingsPage() {
  const [prefs, setPrefs] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/v1/auth/notification-prefs').then((r: any) => setPrefs(r.data)).catch(() => {});
  }, []);

  const toggle = async (k: string, v: boolean) => {
    setPrefs((p: any) => ({ ...p, [k]: v }));
    setBusy(true);
    try {
      const r = await api('/api/v1/auth/notification-prefs', { method: 'PUT', body: { ...prefs, [k]: v } });
      setPrefs(r.data);
    } catch (e: any) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!prefs) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My settings" crumbs={[{ label: 'My Life at Church' }, { label: 'Settings' }]} />

      <Card title="Notification preferences">
        <div className="space-y-3">
          {PREF_ROWS.map(([k, label]) => (
            <label key={k} className="flex items-center justify-between text-sm text-slate-700">
              {label}
              <input type="checkbox" checked={Boolean(prefs[k])} disabled={busy} onChange={(e) => toggle(k, e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600" />
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">Changes apply to future messages only. You are always notified about your own records.</p>
      </Card>
    </div>
  );
}
