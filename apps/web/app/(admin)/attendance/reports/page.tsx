'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import { Card, PageHeader, Select, Skeleton, useMe } from '@/components/ui/primitives';
import { api, fmtDate } from '@/lib/client';

export default function AttendanceReportsPage() {
  const { has } = useMe();
  const [stats, setStats] = useState<any>(null);
  const [weeks, setWeeks] = useState(12);
  const [services, setServices] = useState<any[]>([]);

  useEffect(() => {
    api(`/api/v1/attendance/stats?weeks=${weeks}`).then((r: any) => setStats(r.data)).catch(() => setStats({}));
    api('/api/v1/attendance/services').then((r: any) => setServices(r.data ?? [])).catch(() => {});
  }, [weeks]);

  if (!stats) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /><Skeleton className="h-48" /></div>;

  const trend = (stats.trend ?? []).map((t: any) => ({ ...t, week: fmtDate(t.week, 'short') }));

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Attendance reports"
        description={has('attendance.export') ? 'Weekly trend and per-service averages.' : 'Weekly trend and per-service averages.'}
        crumbs={[{ label: 'Attendance', href: '/attendance' }, { label: 'Reports' }]}
        actions={
          <Select value={String(weeks)} onChange={(e) => setWeeks(Number(e.target.value))} className="!w-40">
            <option value="8">Last 8 weeks</option>
            <option value="12">Last 12 weeks</option>
            <option value="26">Last 26 weeks</option>
          </Select>
        }
      />

      <Card title="Weekly trend (present vs absent)">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              <Line type="monotone" dataKey="present" name="Present" stroke="#1b3a6b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="absent" name="Absent" stroke="#c9a227" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Average attendance by service (8 weeks)">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.byService ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              <Bar dataKey="avg_attendance" name="Avg attendance" fill="#1b3a6b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
