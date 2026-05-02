import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Fixes CORS/font failures when the site is reachable on both HTTP and HTTPS:
 * the page loads on http://origin but redirects push assets/API to https://same-host,
 * which the browser treats as a cross-origin + redirect CORS break.
 *
 * Requires the reverse proxy (Hostinger etc.) to set `x-forwarded-proto`.
 * Also enable "Force HTTPS" / SSL redirect in hosting panel when available.
 */
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  if (process.env.DISABLE_HTTPS_REDIRECT === "true") {
    return NextResponse.next();
  }

  const fwdProto = request.headers.get("x-forwarded-proto");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.split(",")[0]?.trim() ??
    "";
  if (!host) {
    return NextResponse.next();
  }

  const isHttpScheme = fwdProto === "http" || request.nextUrl.protocol === "http:";
  if (!isHttpScheme) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(`https://${host}${pathname}${search}`, 308);
}

export const config = {
  matcher: [
    // Run for pages, API routes, and _next static assets — so nothing stays on accidental HTTP scheme
    "/((?!_next/image/).*)",
  ],
};
