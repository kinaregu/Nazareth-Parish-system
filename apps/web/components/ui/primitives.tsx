'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { authHeaders } from '@/lib/client';

export function cn(...inputs: (string | false | null | undefined)[]): string {
  return twMerge(clsx(inputs));
}

/* ─────────────────────────── Button ─────────────────────────── */

export function Button({
  children, variant = 'primary', size = 'md', className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md';
}) {
  const variants = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-300',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300',
    ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-300',
    gold: 'bg-gold-500 text-primary-900 hover:bg-gold-400 focus-visible:ring-gold-300',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        variants[variant], className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Card ─────────────────────────── */

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, sub, tone = 'default', icon }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'gold' | 'green' | 'red' | 'blue'; icon?: ReactNode;
}) {
  const tones = {
    default: 'text-slate-800', gold: 'text-gold-600', green: 'text-emerald-600', red: 'text-red-600', blue: 'text-primary-600',
  };
  return (
    <div className="card flex items-start justify-between p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={cn('mt-1 truncate text-2xl font-semibold', tones[tone])}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {icon && <div className="rounded-lg bg-primary-50 p-2 text-primary-600">{icon}</div>}
    </div>
  );
}

/* ─────────────────────────── Badge ─────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  active_member: 'bg-emerald-100 text-emerald-700',
  new_member: 'bg-blue-100 text-blue-700',
  visitor: 'bg-slate-100 text-slate-600',
  inactive: 'bg-amber-100 text-amber-700',
  transferred: 'bg-violet-100 text-violet-700',
  moved_away: 'bg-sky-100 text-sky-700',
  deceased: 'bg-slate-200 text-slate-700',
  archived: 'bg-slate-100 text-slate-500',
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  submitted: 'bg-blue-100 text-blue-700',
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-emerald-100 text-emerald-700',
  scheduled: 'bg-blue-100 text-blue-700',
  expired: 'bg-slate-100 text-slate-500',
  paid: 'bg-emerald-100 text-emerald-700',
  open: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-200 text-slate-600',
  recorded: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  reconciled: 'bg-blue-100 text-blue-700',
  reversed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  registered: 'bg-blue-100 text-blue-700',
  attended: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-amber-100 text-amber-700',
  present: 'bg-emerald-100 text-emerald-700',
  first_time: 'bg-violet-100 text-violet-700',
  prayed: 'bg-blue-100 text-blue-700',
  private: 'bg-slate-100 text-slate-600',
  pastoral: 'bg-amber-100 text-amber-700',
  church: 'bg-emerald-100 text-emerald-700',
  ministry: 'bg-violet-100 text-violet-700',
  group: 'bg-sky-100 text-sky-700',
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
  planned: 'bg-blue-100 text-blue-700',
  contacted: 'bg-violet-100 text-violet-700',
  converted: 'bg-emerald-100 text-emerald-700',
  none: 'bg-slate-100 text-slate-500',
};

export function Badge({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        STATUS_COLORS[color || String(children)] ?? 'bg-slate-100 text-slate-600',
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────── Form fields ─────────────────────────── */

export function Field({ label, error, required, children, hint, className }: {
  label: string; error?: string; required?: boolean; children: ReactNode; hint?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">
        {label} {required && <span className="text-red-500" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function Input({ error, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return <input className={cn('input', error && 'input-error', className)} {...rest} />;
}

export function Textarea({ error, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return <textarea className={cn('input min-h-[90px]', error && 'input-error', className)} {...rest} />;
}

export function Select({ error, className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select className={cn('input', error && 'input-error', className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700', className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-300" {...rest} />
      {label}
    </label>
  );
}

/* ─────────────────────────── Modal / Confirm ─────────────────────────── */

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn('card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-4 sm:rounded-xl sm:p-5', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-slate-600">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── Tabs ─────────────────────────── */

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div role="tablist" className="scroll-thin -mb-px flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            active === t.key ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────── Empty / loading states ─────────────────────────── */

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {message && <p className="max-w-sm text-xs text-slate-500">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-slate-200/70', className)} aria-hidden />;
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Avatar ─────────────────────────── */

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-16 w-16 text-xl' };
  const ini = name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  if (src) return <img src={src} alt={name} className={cn('rounded-full object-cover', sizes[size])} />;
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700', sizes[size])} aria-hidden>
      {ini || '?'}
    </span>
  );
}

/* ─────────────────────────── Page header / breadcrumbs ─────────────────────────── */

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1 text-xs text-slate-400">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href ? (
              <a href={it.href} className="hover:text-primary-600">{it.label}</a>
            ) : (
              <span className="text-slate-600">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, description, actions, crumbs }: {
  title: string; description?: string; actions?: ReactNode; crumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-5">
      {crumbs && <Breadcrumbs items={crumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold text-primary-800 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────── Pagination ─────────────────────────── */

export function Pagination({ meta, onPage }: { meta: { page: number; totalPages: number; total: number; pageSize: number } | null; onPage: (p: number) => void }) {
  if (!meta) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
      <p className="text-xs text-slate-500">
        Page {meta.page} of {meta.totalPages} · {meta.total.toLocaleString()} results
      </p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>← Prev</Button>
        <Button size="sm" variant="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Next →</Button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Auth context ─────────────────────────── */

export interface MeUser {
  id: string;
  name: string;
  email: string;
  member_id: string | null;
  must_change_password: boolean;
  totp_enabled: boolean;
  email_verified_at: string | null;
}
export interface MeData {
  user: MeUser;
  scope: {
    roleCodes: string[];
    permissions: string[];
    isSuper: boolean;
    branchIds: string[] | null;
    ministryIds: string[];
    groupIds: string[];
    linkedMemberId: string | null;
    branchId: string | null;
  };
}

const MeContext = createContext<{ me: MeData | null; loading: boolean; has: (p: string) => boolean; isStaff: boolean }>({
  me: null, loading: true, has: () => false, isStaff: false,
});

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/me', { cache: 'no-store', credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        if (on) {
          if (res.ok && data.data) setMe(data.data);
          else window.location.href = '/login';
        }
      } catch {
        if (on) window.location.href = '/login';
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  const has = (p: string) => !!me && (me.scope.isSuper || me.scope.permissions.includes(p));
  const isStaff = !!me && me.scope.roleCodes.some((r) => ['super_admin', 'pastor', 'admin', 'finance', 'ministry_leader', 'group_leader'].includes(r));

  return <MeContext.Provider value={{ me, loading, has, isStaff }}>{children}</MeContext.Provider>;
}

export function useMe() {
  return useContext(MeContext);
}
