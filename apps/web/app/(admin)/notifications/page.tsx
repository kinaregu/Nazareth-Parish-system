'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, PageHeader, useMe } from '@/components/ui/primitives';
import { api, fmtDate } from '@/lib/client';

export default function NotificationsPage() {
  const { me } = useMe();
  const [items, setItems] = useState<any[]>([]);
  const [prefs, setPrefs] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api('/api/v1/notifications');
      setItems(r.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api('/api/v1/auth/notification-prefs').then((r: any) => setPrefs(r.data)).catch(() => {});
  }, [load]);

  const markAll = async () => {
    await api('/api/v1/notifications', { method: 'POST', body: { all: true } });
    load();
  };

  const unread = items.filter((i) => !i.read_at).length;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My notifications" description={unread ? `${unread} unread` : 'You are all caught up.'}
        crumbs={[{ label: 'Communication' }, { label: 'Notifications' }]}
        actions={unread > 0 ? <Button size="sm" variant="secondary" onClick={markAll}>Mark all read</Button> : undefined} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Inbox">
          {loading ? <p className="text-sm text-slate-500">Loading…</p> : items.length === 0 ? (
            <p className="text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <li key={n.id} className={`flex items-start gap-3 py-3 ${n.read_at ? 'opacity-60' : ''}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-slate-300' : 'bg-gold-500'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    {n.body && <p className="text-sm text-slate-500">{n.body}</p>}
                    <p className="mt-0.5 text-xs text-slate-400">{fmtDate(n.created_at, 'long')}</p>
                  </div>
                  {!n.read_at && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await api('/api/v1/notifications', { method: 'POST', body: { id: n.id } });
                      load();
                    }}>Mark read</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Delivery preferences">
          {!prefs ? <p className="text-sm text-slate-500">Loading…</p> : (
            <div className="space-y-3 text-sm">
              {([
                ['email_announcements', 'Email — announcements'],
                ['email_events', 'Email — events'],
                ['email_groups', 'Email — group news'],
                ['sms_events', 'SMS — event reminders'],
                ['sms_followup', 'SMS — follow-up messages'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[k])}
                    onChange={async (e) => {
                      const next = { ...prefs, [k]: e.target.checked };
                      setPrefs(next);
                      try {
                        const r = await api('/api/v1/auth/notification-prefs', { method: 'PUT', body: next });
                        setPrefs(r.data);
                      } catch { /* keep optimistic value */ }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
