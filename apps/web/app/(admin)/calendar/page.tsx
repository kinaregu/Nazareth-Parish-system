'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, PageHeader, Select, Skeleton } from '@/components/ui/primitives';
import { api } from '@/lib/client';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const from = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-01`;
  const to = useMemo(() => {
    const last = new Date(cursor.y, cursor.m + 1, 0).getDate();
    return `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }, [cursor]);

  useEffect(() => {
    setLoading(true);
    api(`/api/v1/calendar?from=${from}&to=${to}`).then((r: any) => setItems(r.data ?? [])).catch(() => setItems([])).finally(() => setLoading(false));
  }, [from, to]);

  const grid = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: ({ date: string; day: number } | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= days; d++) {
      cells.push({ date: `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d });
    }
    return cells;
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    items.forEach((it) => {
      const d = String(it.starts_at).slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(it);
    });
    return m;
  }, [items]);

  const today = new Date().toISOString().slice(0, 10);
  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Church calendar"
        description={`${MONTHS[cursor.m]} ${cursor.y} · ${items.length} event${items.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => move(-1)}>← Prev</Button>
            <Button size="sm" variant="secondary" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); }}>Today</Button>
            <Button size="sm" variant="secondary" onClick={() => move(1)}>Next →</Button>
          </>
        }
      />

      {loading ? <Skeleton className="h-[480px]" /> : (
        <div className="card overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {DOW.map((d) => <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell, i) => (
              <div key={i} className={`min-h-[96px] border-b border-r border-slate-100 p-1.5 ${!cell ? 'bg-slate-50/50' : ''}`}>
                {cell && (
                  <>
                    <p className={`mb-1 text-right text-xs ${cell.date === today ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 font-bold text-white' : 'text-slate-400'}`}>
                      {cell.day}
                    </p>
                    <div className="space-y-1">
                      {(byDay.get(cell.date) ?? []).slice(0, 3).map((it) => (
                        <Link key={it.id} href={`/events/${it.id}`}
                          className={`block truncate rounded px-1.5 py-0.5 text-[11px] leading-tight hover:opacity-80 ${
                            it.status === 'cancelled' ? 'bg-slate-100 text-slate-400 line-through'
                              : it.kind === 'ministry' ? 'bg-violet-50 text-violet-700'
                                : it.kind === 'group' ? 'bg-sky-50 text-sky-700'
                                  : 'bg-primary-50 text-primary-700'
                          }`}>
                          {new Date(it.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} {it.title}
                        </Link>
                      ))}
                      {(byDay.get(cell.date) ?? []).length > 3 && (
                        <p className="text-[10px] text-slate-400">+{byDay.get(cell.date)!.length - 3} more</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
