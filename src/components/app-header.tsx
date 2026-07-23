"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { isAdmin, type SessionPayload } from "@/lib/session";
import { Heartbeat } from "@/components/heartbeat";
import { ReportIssueButton } from "@/components/report-issue-button";

type NavItem = {
  href: string;
  label: string;
  match: (p: string) => boolean;
  icon: (active: boolean) => React.ReactNode;
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    match: (p) => p === "/dashboard" || p === "/dashboard/",
    icon: () => <HomeIcon />,
  },
  {
    href: "/timesheets/projects",
    label: "Projects",
    match: (p) =>
      p === "/timesheets" ||
      p.startsWith("/timesheets/") ||
      p === "/summary" ||
      p.startsWith("/summary/"),
    icon: () => <FolderIcon />,
  },
  {
    href: "/tasks",
    label: "Tasks",
    match: (p) => p === "/tasks" || p.startsWith("/tasks/"),
    icon: () => <TasksIcon />,
  },
  {
    href: "/profile",
    label: "Profile",
    match: (p) => p === "/profile" || p.startsWith("/profile/"),
    icon: () => <UserIcon />,
  },
];

const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "Admin",
  match: (p) => p === "/admin" || p.startsWith("/admin/"),
  icon: () => <ShieldIcon />,
};

export function AppHeader({
  session,
  photoUrl,
  canAccessAdmin,
}: {
  session: SessionPayload;
  photoUrl?: string | null;
  // Whether this user actually has the admin panel available (admin role AND at
  // least one viewable admin page). Falls back to the role check when not
  // provided. Gates the Admin nav + the report/suggest button.
  canAccessAdmin?: boolean;
}) {
  const admin = canAccessAdmin ?? isAdmin(session);
  const pathname = usePathname() ?? "";
  const items = admin ? [...NAV, ADMIN_NAV] : NAV;
  const effectivePhoto = photoUrl ?? session.photoUrl ?? null;

  // Reserve room at the bottom of the page for the fixed mobile tab bar (only
  // takes effect under the sm breakpoint — see globals.css).
  useEffect(() => {
    document.body.classList.add("has-mobile-nav");
    return () => document.body.classList.remove("has-mobile-nav");
  }, []);

  return (
    <>
      <header className="bg-white border-b border-slate-200">
        {/* Mounted globally on every authenticated page so we get presence
            pings as soon as someone opens any route. */}
        <Heartbeat />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <Link
              href="/dashboard"
              aria-label="HealthTech Partners 42, home"
              className="flex items-center py-3 shrink-0"
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
            {/* Desktop inline nav. On mobile this moves to the bottom tab bar. */}
            <nav className="hidden sm:flex items-center gap-1 text-sm min-w-0 overflow-x-auto no-scrollbar">
              {items.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative px-3 py-5 text-sm font-medium whitespace-nowrap transition-colors ${
                      active ? "text-brand-600" : "text-slate-600 hover:text-slate-900"
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
          <div className="flex items-center gap-2 sm:gap-3 text-sm shrink-0">
            {admin ? <ReportIssueButton /> : null}
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

      {/* Mobile bottom tab bar — native-app style. Fixed, safe-area aware,
          hidden from the sm breakpoint up (desktop uses the inline nav). */}
      <nav
        aria-label="Primary"
        className="mobile-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {items.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                    active ? "text-brand-600" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span aria-hidden>{item.icon(active)}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
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

// Tab-bar icons — stroke-based, inherit currentColor.
const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 7a1 1 0 0 1 1-1h4.5l2 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function TasksIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8.5 12l2.4 2.4 4.6-5" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c1-3.1 3.6-4.6 6.5-4.6s5.5 1.5 6.5 4.6" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
    </svg>
  );
}
