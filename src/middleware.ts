import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isAdminRoleName } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/api/auth/signin", "/api/auth/callback"];
const ADMIN_PATH_PREFIXES = ["/admin", "/api/admin"];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function rejectApiOrRedirectLogin(req: NextRequest, status: 403 | "login" = "login") {
  if (req.nextUrl.pathname.startsWith("/api/") || status === 403) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  // Vercel cron (and manual "Run") authenticate with the CRON_SECRET bearer, not
  // a session cookie. Let those through here — the /api/admin cron routes
  // re-verify the secret themselves, and every other admin route still enforces
  // its own session/permission guard, so this bypass grants nothing extra.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return NextResponse.next();
  }
  const token = req.cookies.get("htp42_session")?.value;
  if (!token) return rejectApiOrRedirectLogin(req);

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Fail closed on every protected path if the secret is missing at runtime.
    return rejectApiOrRedirectLogin(req);
  }

  let role = "";
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    role = typeof (payload as { role?: unknown }).role === "string"
      ? ((payload as { role?: string }).role ?? "")
      : "";
  } catch {
    return rejectApiOrRedirectLogin(req);
  }

  if (isAdminPath(pathname) && !isAdminRoleName(role)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/timesheets/:path*",
    "/summary/:path*",
    "/profile/:path*",
    "/admin/:path*",
    "/api/staffings/:path*",
    "/api/timesheets/:path*",
    "/api/profile/:path*",
    "/api/admin/:path*",
  ],
};
