import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants/app";

/**
 * Paths reachable without a session. Everything not listed is denied, so a new
 * route is private unless someone deliberately opens it.
 */
const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/signup",
  "/invite",
  "/reset-password",
];

/** Paths that authenticate themselves and must not be redirected. */
const SELF_AUTHENTICATING_PREFIXES = [
  // Better Auth's own endpoints.
  "/api/auth",
  // Authenticated by the X-Cron-Secret header instead of a session.
  "/api/cron/",
];

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return response;
}

export function proxy(request: NextRequest) {
  return addSecurityHeaders(gate(request));
}

function gate(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;

  if (SELF_AUTHENTICATING_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // Anything with a file extension is a static asset — the login page's own
  // logo among them, so this has to come before the session check.
  if (/\.\w{2,}$/.test(pathname)) {
    return NextResponse.next();
  }

  const isPublic =
    pathname === "/" ||
    PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isPublic) {
    return NextResponse.next();
  }

  /**
   * Middleware runs on the Edge runtime, which cannot open a database
   * connection, so the session cannot be verified here. Presence of the cookie
   * is enough to decide whether to redirect; the route handlers verify the
   * signature for real. Treat this as a redirect, not as authorization.
   */
  const sessionCookie =
    request.cookies.get(`__Secure-${SESSION_COOKIE_NAME}`) ||
    request.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
