'use client';

import { useState, type ReactNode } from 'react';
import { cn, Pagination, TableSkeleton, EmptyState } from './primitives';
import { authHeaders } from '@/lib/client';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => ReactNode;
}

/**
 * Server-side data table: sorting, pagination, loading/empty/error states.
 * The parent owns fetching (via useList) and passes data + meta.
 */
export function DataTable<T extends { id?: string }>({
  columns, rows, meta, loading, error, sort, order, onSort, onPage, onRetry, onRowClick, rowActions, emptyTitle, emptyMessage, emptyAction, pageSize = 25,
}: {
  columns: Column<T>[];
  rows: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number } | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  sort?: string;
  order?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  onPage: (page: number) => void;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  pageSize?: number;
}) {
  const [visible, setVisible] = useState(pageSize);
  return (
    <div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="border-b border-slate-200 bg-slate-50/60">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn('th', c.sortable && 'cursor-pointer select-none hover:text-slate-700')}
                  onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
                  aria-sort={sort === c.key ? (order === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.sortable && sort === c.key && <span aria-hidden>{order === 'asc' ? '↑' : '↓'}</span>}
                  </span>
                </th>
              ))}
              {rowActions && <th className="th w-10 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 1}><TableSkeleton rows={6} cols={columns.length} /></td></tr>
            ) : error ? (
              <tr>
                <td colSpan={columns.length + 1} className="td p-6 text-center text-red-600">
                  {error}
                  {onRetry && (
                    <div className="mt-2">
                      <button onClick={onRetry} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                        Try again
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length + (rowActions ? 1 : 0)}>
                <EmptyState title={emptyTitle ?? 'No records found.'} message={emptyMessage} action={emptyAction} />
              </td></tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id ?? i}
                  className={cn('border-b border-slate-100 transition-colors hover:bg-primary-50/40', onRowClick && 'cursor-pointer')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn('td', c.className)}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">{rowActions(row)}</div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Per page
          <select className="input !w-auto !py-1 !text-xs" value={visible} onChange={(e) => { setVisible(Number(e.target.value)); onPage(1); }}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex-1 px-4"><Pagination meta={meta ? { ...meta, pageSize: visible } : null} onPage={onPage} /></div>
      </div>
    </div>
  );
}

/** Hook: fetch a list endpoint with page/sort state. */
export function useList(urlBase: string, initialParams: Record<string, unknown> = {}) {
  const [params, setParams] = useState<Record<string, any>>(initialParams);
  const [state, setState] = useState<{ data: any[]; meta: any; loading: boolean; error: string | null; sort: string; order: 'asc' | 'desc' }>({
    data: [], meta: null, loading: true, error: null, sort: '', order: 'asc',
  });

  const load = async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const sp = new URLSearchParams();
      const { page = 1, sort, order, ...rest } = params;
      const ord: 'asc' | 'desc' = order === 'desc' ? 'desc' : 'asc';
      sp.set('page', String(Number(page) || 1));
      sp.set('order', ord);
      if (sort) sp.set('sort', String(sort));
      for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
      const res = await fetch(`${urlBase}?${sp}`, { cache: 'no-store', credentials: 'same-origin', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? 'Unable to load records. Please try again.');
      setState({ data: data.data ?? [], meta: data.meta ?? null, loading: false, error: null, sort: String(sort ?? ''), order: ord });
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: e.message ?? 'Unable to load records. Please try again.' }));
    }
  };

  // Reload when params change
  const key = JSON.stringify(params);
  const [lastKey, setLastKey] = useState('');
  if (key !== lastKey) {
    setLastKey(key);
    setTimeout(() => load(), 0);
  }

  const setParam = (patch: Record<string, any>, resetPage = true) =>
    setParams((p) => ({ ...p, ...patch, ...(resetPage ? { page: 1 } : {}) }));
  const setPage = (page: number) => setParams((p) => ({ ...p, page }));
  const toggleSort = (col: string) =>
    setParams((p) => ({ ...p, sort: p.sort === col && p.order === 'asc' ? col : col, order: p.sort === col && p.order === 'asc' ? 'desc' : 'asc', page: 1 }));

  return { ...state, params, setParam, setPage, toggleSort, reload: load };
}
