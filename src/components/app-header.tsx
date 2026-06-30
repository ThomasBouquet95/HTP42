"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { isAdmin, type SessionPayload } from "@/lib/session";
import { Heartbeat } from "@/components/heartbeat";

type NavItem = { href: string; label: string; match: (p: string) => boolean };

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    match: (p) => p === "/dashboard" || p === "/dashboard/",
  },
  {
    href: "/timesheets/projects",
    label: "Projects",
    match: (p) =>
      p === "/timesheets" ||
      p.startsWith("/timesheets/") ||
      p === "/summary" ||
      p.startsWith("/summary/"),
  },
  {
    href: "/tasks",
    label: "Tasks",
    match: (p) => p === "/tasks" || p.startsWith("/tasks/"),
  },
  { href: "/profile", label: "Profile", match: (p) => p === "/profile" || p.startsWith("/profile/") },
];

const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "Admin",
  match: (p) => p === "/admin" || p.startsWith("/admin/"),
};

export function AppHeader({
  session,
  photoUrl,
}: {
  session: SessionPayload;
  photoUrl?: string | null;
}) {
  const admin = isAdmin(session);
  const pathname = usePathname() ?? "";
  const items = admin ? [...NAV, ADMIN_NAV] : NAV;
  const effectivePhoto = photoUrl ?? session.photoUrl ?? null;

  return (
    <header className="bg-white border-b border-slate-200">
      {/* Mounted globally on every authenticated page (the header itself is)
          so we get presence pings as soon as someone opens any route. */}
      <Heartbeat />
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            aria-label="HealthTech Partners 42, home"
            className="flex items-center py-3"
          >
            <Image
              src="/htp42-mark.png"
              alt=""
              width={580}
              height={326}
              priority
              className="h-7 w-auto"
            />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {items.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3 py-5 text-sm font-medium transition-colors ${
                    active
                      ? "text-brand-600"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="inline-flex items-center gap-1.5">{item.label}</span>
                  <span
                    className={`pointer-events-none absolute left-2 right-2 -bottom-px h-0.5 rounded-full transition-colors ${
                      active ? "bg-brand-600" : "bg-transparent"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600 hidden sm:inline">
            {session.fullName || session.email} ·{" "}
            <span className="font-mono">{session.memberCode}</span>
            {admin ? (
              <span className="ml-2 rounded-full bg-slate-800 text-white text-[10px] px-2 py-0.5 align-middle">
                ADMIN
              </span>
            ) : null}
          </span>
          <Link
            href="/profile"
            title="My profile"
            aria-label="My profile"
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full overflow-hidden ring-2 ring-white shadow-sm bg-brand-50 text-brand-700 text-xs font-semibold hover:ring-brand-200 transition"
          >
            {effectivePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={effectivePhoto} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{userInitials(session.fullName, session.email)}</span>
            )}
          </Link>
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="text-slate-600 hover:text-slate-900">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

function userInitials(fullName: string, email: string): string {
  const source = fullName || email || "?";
  const parts = source.trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}
