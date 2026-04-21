import Link from "next/link";
import type { SessionPayload } from "@/lib/auth";

export function AppHeader({ session }: { session: SessionPayload }) {
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-semibold">
            HTP42 Timesheets
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
              Timesheets
            </Link>
            <Link href="/summary" className="text-slate-600 hover:text-slate-900">
              Summary
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-600 hidden sm:inline">
            {session.fullName || session.email} · <span className="font-mono">{session.memberCode}</span>
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
