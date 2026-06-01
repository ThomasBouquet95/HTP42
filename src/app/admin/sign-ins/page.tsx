import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { listSignInActivity } from "@/lib/airtable";
import { AdminTabs } from "@/components/admin-tabs";
import { SignInActivityClient } from "./sign-ins-client";

export const dynamic = "force-dynamic";

// Live presence horizons. "Online" matches the heartbeat cadence (60s
// client + 45s server throttle), so anything fresher than ~2 minutes is
// considered live.
const ONLINE_MS = 2 * 60 * 1000;
const RECENT_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminSignInsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const rows = await listSignInActivity();

  const now = Date.now();

  // Headline counts. Computed server-side so the client component stays lean.
  let onlineNow = 0;
  let activeToday = 0;
  let signedInLast7 = 0;
  let signedInLast30 = 0;
  let neverSignedIn = 0;
  for (const r of rows) {
    if (!r.lastSignIn) neverSignedIn += 1;
    else {
      const ts = Date.parse(r.lastSignIn);
      if (Number.isFinite(ts)) {
        if (now - ts < 7 * DAY_MS) signedInLast7 += 1;
        if (now - ts < 30 * DAY_MS) signedInLast30 += 1;
      }
    }
    if (r.lastActivity) {
      const ta = Date.parse(r.lastActivity);
      if (Number.isFinite(ta)) {
        if (now - ta < ONLINE_MS) onlineNow += 1;
        if (now - ta < DAY_MS) activeToday += 1;
      }
    }
  }
  const totalSignIns = rows.reduce((sum, r) => sum + r.signInCount, 0);

  // Daily sign-ins for the last 30 days, used by the chart. We bucket by the
  // user's *last* sign-in timestamp — we only have that one per member, not
  // every individual login event, so the chart shows "members whose latest
  // session landed on this day" rather than total sessions across all time.
  const signInBuckets = buildDailyBuckets(rows.map((r) => r.lastSignIn), 30);
  const activityBuckets = buildDailyBuckets(rows.map((r) => r.lastActivity), 30);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="signins" />
      <header className="mb-5">
        <h1 className="text-base sm:text-lg font-semibold text-slate-900">Sign-in activity</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Who's currently on the portal and when each member last opened it.
          Presence is refreshed every minute by an in-app heartbeat.
        </p>
      </header>

      <SignInActivityClient
        rows={rows}
        kpis={{
          onlineNow,
          activeToday,
          totalMembers: rows.length,
          signedInLast7,
          signedInLast30,
          neverSignedIn,
          totalSignIns,
        }}
        signInBuckets={signInBuckets}
        activityBuckets={activityBuckets}
      />
    </main>
  );
}

// Returns one bucket per day for the past `days` days (oldest first), each
// containing the count of timestamps that fell on that day. Days are local
// to the server; that's fine since the portal is single-tenant and Paris-
// based.
function buildDailyBuckets(
  isos: Array<string | null>,
  days: number,
): { key: string; count: number }[] {
  const buckets: { key: string; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDay = new Date(today.getTime() - (days - 1) * DAY_MS);
  for (let i = 0; i < days; i++) {
    const d = new Date(startDay.getTime() + i * DAY_MS);
    buckets.push({ key: dayKey(d), count: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const iso of isos) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    const k = dayKey(d);
    const i = idx.get(k);
    if (i !== undefined) buckets[i].count += 1;
  }
  return buckets;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
