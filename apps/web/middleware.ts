import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: security headers + lightweight route guards.
 * Real authentication/authorization always happens server-side in the
 * API layer and service layer (never in middleware).
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get('chms_session')?.value);

  if (pathname === '/') {
    return NextResponse.redirect(new URL(hasSession ? '/dashboard' : '/login', req.url));
  }
  if (pathname === '/login' && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  // Guarantee a CSRF double-submit token exists for every visitor (login is
  // exempt from the check; everything else sends it back in X-CSRF-TOKEN).
  if (!req.cookies.get('chms_csrf')?.value) {
    const token =
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2);
    res.cookies.set('chms_csrf', token, { httpOnly: false, sameSite: 'none', secure: true, path: '/', maxAge: 30 * 24 * 3600 });
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
};
