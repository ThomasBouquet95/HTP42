import Link from "next/link";
import type React from "react";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";

export const dynamic = "force-dynamic";

type Card = {
  href: string;
  title: string;
  description: string;
  Icon: React.ComponentType;
  // Tailwind colour key for the icon chip background.
  tone: "people" | "delivery" | "finance";
};

type Group = {
  title: string;
  cards: Card[];
};

const GROUPS: Group[] = [
  {
    title: "People",
    cards: [
      {
        href: "/admin/members",
        title: "Network Members",
        description: "View every member; edit name, role, status, contact and contract details.",
        Icon: UsersIcon,
        tone: "people",
      },
      {
        href: "/admin/clients",
        title: "Clients",
        description: "Create and edit client records.",
        Icon: BriefcaseIcon,
        tone: "people",
      },
    ],
  },
  {
    title: "Delivery",
    cards: [
      {
        href: "/admin/projects",
        title: "Projects",
        description: "Create and edit projects, SOW status and totals.",
        Icon: FolderIcon,
        tone: "delivery",
      },
      {
        href: "/admin/staffing",
        title: "Project Staffing",
        description: "Manage consultant engagements, rates, days and SOW.",
        Icon: UsersIcon,
        tone: "delivery",
      },
      {
        href: "/admin/timesheets",
        title: "Timesheets",
        description: "Cross-member timesheet view with filters, CSV and PDF export.",
        Icon: ClockIcon,
        tone: "delivery",
      },
    ],
  },
  {
    title: "Finance",
    cards: [
      {
        href: "/admin/payments",
        title: "Payments",
        description: "Finance dashboard: inflows and outflows, totals by status and currency.",
        Icon: CashIcon,
        tone: "finance",
      },
    ],
  },
];

const TONE_BG: Record<Card["tone"], string> = {
  people: "bg-violet-50 text-violet-600 ring-violet-100",
  delivery: "bg-brand-50 text-brand-600 ring-brand-100",
  finance: "bg-emerald-50 text-emerald-600 ring-emerald-100",
};

export default async function AdminLandingPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="home" />
      <header className="mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Admin</h1>
      </header>

      <div className="space-y-8">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {g.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.cards.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${TONE_BG[c.tone]}`}
                    >
                      <c.Icon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-sm font-semibold text-slate-900 group-hover:text-brand-700">
                        {c.title}
                        <ChevronRightIcon />
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">{c.description}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="9" cy="8" r="3.5" strokeLinejoin="round" />
      <path d="M2.5 19.5c.7-3.5 3.4-5 6.5-5s5.8 1.5 6.5 5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.5c2.4.2 4.5 1.6 5 4.5" strokeLinecap="round" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" strokeLinecap="round" />
      <path d="M3 12h18" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5h.01M18 14.5h.01" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3 translate-x-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
