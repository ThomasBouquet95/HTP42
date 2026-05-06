import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { listSignInActivity } from "@/lib/airtable";
import { AdminTabs } from "@/components/admin-tabs";
import { SignInActivityClient } from "./sign-ins-client";

export const dynamic = "force-dynamic";

export default async function AdminSignInsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const rows = await listSignInActivity();

  // Pre-compute headline counts so the client component stays lean.
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let signedInLast7 = 0;
  let signedInLast30 = 0;
  let neverSignedIn = 0;
  for (const r of rows) {
    if (!r.lastSignIn) {
      neverSignedIn += 1;
      continue;
    }
    const t = Date.parse(r.lastSignIn);
    if (Number.isFinite(t)) {
      if (now - t < 7 * dayMs) signedInLast7 += 1;
      if (now - t < 30 * dayMs) signedInLast30 += 1;
    }
  }
  const totalSignIns = rows.reduce((sum, r) => sum + r.signInCount, 0);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="signins" />
      <header className="mb-5">
        <h1 className="text-base sm:text-lg font-semibold text-slate-900">Sign-in activity</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Last sign-in and total sign-in count per network member. Counts only
          include sign-ins captured since this page went live.
        </p>
      </header>

      <SignInActivityClient
        rows={rows}
        kpis={{
          totalMembers: rows.length,
          signedInLast7,
          signedInLast30,
          neverSignedIn,
          totalSignIns,
        }}
      />
    </main>
  );
}

