/**
 * Client-side API helper. Sends the CSRF double-submit header on mutations
 * and redirects to /login on 401 (except for auth endpoints).
 */
'use client';

import { toast } from 'sonner';

export class ApiClientError extends Error {
  code: string;
  details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/**
 * Session token storage.
 *
 * The session travels two channels:
 *  1. httpOnly `chms_session` cookie (works in normal top-level browser tabs,
 *     and protects the user if JavaScript is unavailable),
 *  2. `Authorization: Bearer <token>` header stored in localStorage.
 *
 * Channel 2 is required because some browser/proxy configurations (embedded
 * previews, strict cookie policies, cross-site partitions) silently drop the
 * cookie on follow-up XHRs. The bearer channel also powers the future mobile
 * app, which uses the same API-first contract.
 */
const TOKEN_KEY = 'chms_session_token';

// In-memory session token. Survives SPA navigation within one page load.
let memoryToken: string | null = null;

function readStored(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getSessionToken(): string | null {
  return memoryToken || readStored();
}

export function setSessionToken(token: string | null): void {
  memoryToken = token && token.length > 0 ? token : null;
  if (typeof localStorage === 'undefined') return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked — in-memory channel still works for this page load */
  }
}

/**
 * Third session channel: a token delivered in the URL fragment (`#st=<token>`).
 *
 * Some embedded/preview browser contexts refuse BOTH cookies and storage.
 * The login page navigates with `#st=…`; the fragment is never transmitted to
 * the server, and we pick it up here at module load (before React renders) and
 * strip it from the address bar — unless storage is blocked, in which case the
 * fragment is kept because it is the only thing that survives a page refresh.
 */
if (typeof window !== 'undefined') {
  const m = window.location.hash.match(/(?:^#|&)st=([^&]+)/);
  if (m) {
    try {
      const t = decodeURIComponent(m[1]);
      if (t) setSessionToken(t);
    } catch {
      /* malformed fragment — ignore */
    }
    let storageOk = true;
    try {
      localStorage.setItem('__chms_probe', '1');
      localStorage.removeItem('__chms_probe');
    } catch {
      storageOk = false;
    }
    if (storageOk) {
      try {
        const url = new URL(window.location.href);
        let rest = url.hash.replace(/(?:^#|&)st=[^&]+/, '');
        if (rest.startsWith('&')) rest = '#' + rest.slice(1);
        url.hash = rest === '#' ? '' : rest.replace(/^#/, '');
        window.history.replaceState(null, '', url.toString());
      } catch {
        /* non-critical */
      }
    }
  }
}

/** Headers that carry the bearer token (safe to spread into any fetch). */
export function authHeaders(): Record<string, string> {
  const t = getSessionToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListResult<T = any> {
  data: T[];
  meta: ListMeta;
  [k: string]: any;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; file?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, file = false } = opts;
  const headers: Record<string, string> = { ...authHeaders() };
  const token = getCookie('chms_csrf');
  if (method !== 'GET' && method !== 'HEAD' && token) headers['x-csrf-token'] = token;
  const isForm = file || typeof FormData !== 'undefined' && body instanceof FormData;
  if (!isForm && body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    cache: 'no-store',
  });

  if (res.status === 401) {
    setSessionToken(null); // stale token — drop it so we don't keep resending it
    if (!path.includes('/api/v1/auth/')) window.location.href = '/login';
    throw new ApiClientError('UNAUTHORIZED', 'Please sign in to continue.');
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new ApiClientError('INTERNAL', 'Unexpected server response.');
    return null as T;
  }

  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiClientError(err.code ?? 'INTERNAL', err.message ?? 'Something went wrong.', err.details);
  }
  return data as T;
}

/** Convenience GET that lists resources. */
export function apiList<T = any>(path: string): Promise<ListResult<T>> {
  return api<ListResult<T>>(path);
}

export function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function fmtMoney(v: number | string | null | undefined, currency = 'SSP', symbol?: string): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  const s = symbol ?? (currency === 'SSP' ? 'SS₤' : currency === 'USD' ? '$' : currency);
  return `${s}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(v: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-GB', style === 'long' ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function errMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function notifyError(e: unknown, fallback = 'Something went wrong. Please try again.'): void {
  toast.error(errMessage(e, fallback));
}
