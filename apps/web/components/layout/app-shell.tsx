'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn, Avatar, useMe, Button } from '@/components/ui/primitives';
import { api, authHeaders, setSessionToken } from '@/lib/client';

interface NavItem { label: string; href: string; perm?: string; icon: string; }
interface NavSection { title?: string; items: NavItem[]; }

const ICONS: Record<string, string> = {
  dashboard: 'M3 12 12 3l9 9M5 10v10h14V10',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  heart: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .9-4.5 3-1.5-2.1-2.7-3-4.5-3A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z',
  coin: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  chart: 'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6m7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5L9 5.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2L9.5 21h5l.5-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2z',
  clipboard: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4',
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  church: 'M12 2v6m-3-3h6M4 21V11l8-2 8 2v10M4 21h16M9 21v-5a3 3 0 0 1 6 0v5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.35-4.35',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
};

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={cn('h-4 w-4 shrink-0', className)} aria-hidden>
      <path d={ICONS[name] ?? ICONS.list} />
    </svg>
  );
}

export function useNotificationCount(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);
  const refresh = () => {
    fetch('/api/v1/notifications?unreadOnly=true', { cache: 'no-store', credentials: 'same-origin', headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setCount(d?.meta?.total ?? 0))
      .catch(() => {});
  };
  return { count, refresh };
}

export function AppShell({ children, sections, home = '/dashboard', footer }: {
  children: React.ReactNode;
  sections: NavSection[];
  home?: string;
  footer?: string;
}) {
  const { me, has, isStaff } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchRes, setSearchRes] = useState<any>(null);
  const { count: notifCount, refresh: refreshNotifs } = useNotificationCount();

  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.perm || has(it.perm)) }))
    .filter((s) => s.items.length > 0);

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setSearchRes(null); return; }
    const d = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, { cache: 'no-store', credentials: 'same-origin', headers: authHeaders() }).then((r) => r.json()).catch(() => null);
    setSearchRes(d?.data ?? null);
  };

  const logout = async () => {
    try { await api('/api/v1/auth/logout', { method: 'POST' }); } catch {}
    setSessionToken(null);
    window.location.href = '/login';
  };

  const Sidebar = (
    <div className="flex h-full flex-col bg-primary-800 text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <img src="/brand/logo.png" alt="" className="h-10 w-10 rounded-full bg-white/95 object-contain p-0.5" />
        <div className="leading-tight">
          <p className="font-serif text-sm font-semibold">Nazareth Parish</p>
          <p className="text-[11px] text-primary-200">{footer ?? 'Church Management'}</p>
        </div>
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
        {visibleSections.map((s, i) => (
          <div key={i} className="mb-4">
            {s.title && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-primary-300">{s.title}</p>}
            {s.items.map((it) => {
              const active = pathname === it.href || (it.href !== home && pathname.startsWith(it.href));
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                    active ? 'bg-white/15 text-white' : 'text-primary-100 hover:bg-white/10 hover:text-white',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon name={it.icon} />
                  {it.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-lg bg-white/5 p-2">
          <Avatar name={me?.user.name ?? '?'} size="sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-medium">{me?.user.name}</p>
            <p className="truncate text-[10px] text-primary-300">{me ? me.scope.roleCodes.map(r => r.replace('_', ' ')).join(', ') : ''}</p>
          </div>
          <button onClick={logout} title="Sign out" aria-label="Sign out" className="rounded p-1.5 text-primary-200 hover:bg-white/10 hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{Sidebar}</aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64">{Sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>

          <div className="relative max-w-md flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-slate-400"><Icon name="search" /></span>
            <input
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); setSearchOpen(true); doSearch(e.target.value); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              placeholder="Search members, groups, events…"
              aria-label="Global search"
              className="input !rounded-full !bg-slate-100 !pl-8 !py-1.5 !text-sm focus:!bg-white"
            />
            {searchOpen && searchRes && (
              <div className="card absolute left-0 right-0 top-11 z-30 max-h-96 overflow-y-auto p-2">
                {(['members', 'families', 'visitors', 'groups', 'ministries', 'events'] as const).map((kind) => {
                  const items = searchRes[kind] ?? [];
                  if (!items.length) return null;
                  const href = (r: any) =>
                    kind === 'members' ? `/members/${r.id}` : kind === 'families' ? `/families/${r.id}` :
                    kind === 'visitors' ? `/visitors/${r.id}` : kind === 'groups' ? `/groups/${r.id}` :
                    kind === 'ministries' ? `/ministries/${r.id}` : `/events/${r.id}`;
                  return (
                    <div key={kind}>
                      <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{kind}</p>
                      {items.map((r: any) => (
                        <button key={r.id} onClick={() => { setSearchQ(''); setSearchOpen(false); router.push(href(r)); }}
                          className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-primary-50">
                          <span className="font-medium text-slate-700">{r.name ?? r.title}</span>
                          {r.status && <span className="ml-2 text-xs capitalize text-slate-400">{r.status}</span>}
                        </button>
                      ))}
                    </div>
                  );
                })}
                {Object.values(searchRes).every((v: any) => !v?.length) && <p className="px-2 py-3 text-sm text-slate-500">No results for “{searchQ}”.</p>}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/notifications" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
              <Icon name="bell" className="h-5 w-5" />
              {notifCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-primary-900">{notifCount}</span>
              )}
            </Link>
            <Link href={isStaff ? '/profile' : '/portal/profile'} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100">
              <Avatar name={me?.user.name ?? '?'} size="sm" />
              <span className="hidden max-w-[140px] truncate text-sm font-medium text-slate-700 sm:block">{me?.user.name}</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
