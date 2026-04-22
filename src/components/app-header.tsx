"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { isAdmin, type SessionPayload } from "@/lib/session";

type NavItem = { href: string; label: string; match: (p: string) => boolean };

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Timesheets",
    match: (p) => p === "/dashboard" || p.startsWith("/dashboard/") || p.startsWith("/timesheets"),
  },
  { href: "/summary", label: "Summary", match: (p) => p === "/summary" || p.startsWith("/summary/") },
  { href: "/profile", label: "Profile", match: (p) => p === "/profile" || p.startsWith("/profile/") },
];

const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "Admin",
  match: (p) => p === "/admin" || p.startsWith("/admin/"),
};

export function AppHeader({ session }: { session: SessionPayload }) {
  const admin = isAdmin(session);
  const pathname = usePathname() ?? "";
  const items = admin ? [...NAV, ADMIN_NAV] : NAV;

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 py-4" aria-label="HealthTech Partners 42">
            <Image src="/logo-mark.svg" alt="" width={28} height={28} priority />
            <span className="text-base font-semibold text-brand-600 tracking-tight">
              HealthTech Partners 42
            </span>
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
                  {item.label}
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
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-600 hidden sm:inline">
            {session.fullName || session.email} ·{" "}
            <span className="font-mono">{session.memberCode}</span>
            {admin ? (
              <span className="ml-2 rounded-full bg-slate-800 text-white text-[10px] px-2 py-0.5 align-middle">
                ADMIN
              </span>
            ) : null}
          </span>
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
