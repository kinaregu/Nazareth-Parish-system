/**
 * Server-side API controller helpers (framework glue layer).
 *
 * Controllers stay thin:  auth → permission → scoped service call → JSON.
 * All business rules & authorization live in @nazareth/core.
 */
import { cookies, headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { loadEnv } from '@nazareth/db';
import { auth as authService, loadScope, ApiError, toApiError, type AccessScope } from '@nazareth/core';

// Load .env (repo root) before the first DB query in this process.
loadEnv();

export interface Ctx {
  user: NonNullable<Awaited<ReturnType<typeof authService.getUserById>>>;
  scope: AccessScope;
  ip: string;
  ua: string;
  userId: string;
  orgId: string;
}
export interface AnonCtx {
  user: null;
  scope: null;
  ip: string;
  ua: string;
  userId: string;
  orgId: string;
}

export async function getAnonCtx(req: NextRequest): Promise<AnonCtx> {
  const h = req.headers;
  return { user: null, scope: null, ip: clientIp(h), ua: h.get('user-agent') ?? '', userId: '', orgId: '' };
}

function clientIp(h: Headers): string {
  const fwd = h.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || h.get('x-real-ip') || '127.0.0.1';
}

export async function getCtx(req: NextRequest): Promise<Ctx | AnonCtx> {
  const anon = await getAnonCtx(req);
  const store = cookies();
  // Session token arrives via `Authorization: Bearer` header (SPA / mobile app)
  // or the httpOnly cookie (plain browser navigation). Header wins if present.
  const headerAuth = req.headers.get('authorization') ?? '';
  const headerToken = headerAuth.startsWith('Bearer ') ? headerAuth.slice(7).trim() : '';
  const token = headerToken || store.get('chms_session')?.value;
  if (!token) return anon;
  const sess = await authService.getSession(token).catch(() => null);
  if (!sess) return anon;
  const user = await authService.getUserById(sess.userId);
  if (!user || !user.is_active) return anon;
  const scope = await loadScope(user.id);
  if (!scope) return anon;
  return { user, scope, ip: anon.ip, ua: anon.ua, userId: user.id, orgId: scope.orgId };
}

export function requireAuth(ctx: Ctx | AnonCtx): Ctx {
  if (!ctx.user || !ctx.scope) throw ApiError.unauthorized();
  return ctx as Ctx;
}

export function requirePerm(ctx: Ctx | AnonCtx, code: string): Ctx {
  const c = requireAuth(ctx);
  if (!c.scope.isSuper && !c.scope.permissions.has(code)) {
    throw ApiError.forbidden();
  }
  return c;
}

/** CSRF double-submit check for mutating requests. */
const CSRF_EXEMPT = ['/api/v1/auth/login', '/api/v1/registrations'];
export function assertCsrf(req: NextRequest): void {
  const method = req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  if (CSRF_EXEMPT.includes(req.nextUrl.pathname)) return; // rate-limited, no privileged state change
  // Bearer-token requests are CSRF-safe by construction: cross-origin pages
  // cannot set the `Authorization` header (CORS preflight fails — we send no
  // CORS headers), and simple cross-site form posts never carry it.
  if ((req.headers.get('authorization') ?? '').startsWith('Bearer ')) return;
  const cookieToken = cookies().get('chms_csrf')?.value;
  const headerToken = req.headers.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new ApiError(403, 'FORBIDDEN', 'Invalid or missing CSRF token. Refresh the page and try again.');
  }
}

/** Standard envelope for list endpoints. */
export function pageResponse(data: any, meta: any, extra?: Record<string, unknown>) {
  return NextResponse.json({ data, meta, ...extra });
}

export function jsonOk(data: any, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function handleError(err: unknown): NextResponse {
  const e = toApiError(err);
  if (e.status >= 500) console.error('[api]', err);
  return NextResponse.json(
    { error: { code: e.code, message: e.message, details: e.details } },
    { status: e.status },
  );
}

/** Wrap a route handler with auth context + error envelope. */
export function withCtx(handler: (req: NextRequest, ctx: Ctx | AnonCtx) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      assertCsrf(req);
      const ctx = await getCtx(req);
      return await handler(req, ctx);
    } catch (err) {
      return handleError(err);
    }
  };
}

/** Set the session + CSRF cookies on a response.
 *  SameSite=None + Secure so the cookie also survives embedded/cross-site
 *  preview contexts; the bearer-token channel covers browsers that refuse
 *  such cookies entirely. (Secure cookies are still allowed on localhost.) */
export function sessionCookies(res: NextResponse, token: string, remember: boolean): void {
  const maxAge = remember ? 30 * 24 * 3600 : 24 * 3600;
  res.cookies.set('chms_session', token, {
    httpOnly: true, sameSite: 'none', secure: true, path: '/', maxAge,
  });
  const csrf = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  res.cookies.set('chms_csrf', csrf, {
    httpOnly: false, sameSite: 'none', secure: true, path: '/', maxAge,
  });
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set('chms_session', '', { httpOnly: true, sameSite: 'none', secure: true, path: '/', maxAge: 0 });
  res.cookies.set('chms_csrf', '', { httpOnly: false, sameSite: 'none', secure: true, path: '/', maxAge: 0 });
}

/** Parse query string into typed filters (values stay strings; services cast). */
export function q(params: URLSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of params.entries()) if (v !== '') out[k] = v;
  return out;
}

export async function parseBody<T>(req: NextRequest, schema?: { parse: (v: unknown) => T }): Promise<T> {
  const raw = await req.json().catch(() => {
    throw ApiError.validation('Request body must be valid JSON.');
  });
  if (!schema) return raw as T;
  try {
    return schema.parse(raw);
  } catch (err) {
    // Zod validation failure → 400 with a readable message (never a 500).
    if (err && typeof err === 'object' && 'issues' in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues ?? [];
      const first = issues[0];
      const field = first?.path?.length ? String(first.path.join('.')) : 'input';
      throw ApiError.validation(`${field}: ${first?.message ?? 'invalid value'} (${issues.length} issue${issues.length === 1 ? '' : 's'})`);
    }
    throw err;
  }
}
