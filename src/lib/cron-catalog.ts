// Read-only catalog of the portal's scheduled jobs. The schedule + path are the
// single source of truth in vercel.json (imported here so this never drifts
// from what actually runs); this module only adds human descriptions and the
// cron-expression helpers used by the Tech -> Cron jobs page.

import vercel from "../../vercel.json";

export type CronMeta = {
  title: string;
  description: string;
  category: "Finance" | "Timesheets" | "Reporting";
  // Whether a signed-in admin can also trigger it on demand (POST to the route).
  manualTrigger: boolean;
};

// Per-route descriptions. Keyed by the exact path in vercel.json.
export const CRON_META: Record<string, CronMeta> = {
  "/api/admin/payments/backfill-eur": {
    title: "Backfill payment EUR values",
    description:
      "Recomputes the EUR value of any payment missing one (foreign-currency invoice with no stored rate), so cockpit totals and exports never leave a row uncounted.",
    category: "Finance",
    manualTrigger: true,
  },
  "/api/admin/vendor-invoices/import": {
    title: "Import vendor invoices",
    description:
      "Pulls paid supplier / IT invoices from the finance mailbox and files each as a Paid Outflow payment, hands-off, so bookkeeping shows up without manual entry.",
    category: "Finance",
    manualTrigger: true,
  },
  "/api/cron/auto-approve-timesheets": {
    title: "Auto-approve stale client reviews",
    description:
      "Approves client-review timesheets the client never acted on within the review window (7 days), so billing isn't stuck waiting on an unresponsive reviewer.",
    category: "Timesheets",
    manualTrigger: true,
  },
  "/api/cron/project-status-digest": {
    title: "Daily project status digest",
    description:
      "Emails the founders a portfolio snapshot categorising every project as Running / Planned / Completed, with a Claude-written summary leading on anything at risk. Recipients are editable in Tech -> Emails.",
    category: "Reporting",
    manualTrigger: true,
  },
};

const FALLBACK_META: CronMeta = {
  title: "Scheduled job",
  description: "No description recorded for this route yet.",
  category: "Finance",
  manualTrigger: false,
};

export type CronJob = {
  path: string;
  schedule: string;
} & CronMeta;

// The configured jobs, straight from vercel.json + their descriptions.
export function listCronJobs(): CronJob[] {
  const crons = (vercel as { crons?: { path: string; schedule: string }[] }).crons ?? [];
  return crons.map((c) => ({
    path: c.path,
    schedule: c.schedule,
    ...(CRON_META[c.path] ?? { ...FALLBACK_META, title: c.path }),
  }));
}

// ---- Cron-expression helpers (standard 5-field: minute hour dom month dow) ----

export type CronFields = { minute: string; hour: string; dom: string; month: string; dow: string };

export function cronFields(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = parts;
  return { minute, hour, dom, month, dow };
}

// Does `val` satisfy a single cron field (supports *, a, a-b, a,b, */n, a-b/n)?
function fieldMatches(field: string, val: number, min: number, max: number): boolean {
  return field.split(",").some((raw) => {
    const [rangePart, stepPart] = raw.split("/");
    const step = stepPart ? parseInt(stepPart, 10) || 1 : 1;
    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = min;
      hi = max;
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-").map((n) => parseInt(n, 10));
      lo = a;
      hi = b;
    } else {
      lo = hi = parseInt(rangePart, 10);
    }
    if (Number.isNaN(lo) || Number.isNaN(hi) || val < lo || val > hi) return false;
    return (val - lo) % step === 0;
  });
}

// The next UTC instant the expression fires at or after `from` (exclusive of the
// current minute). Returns null for an unparseable expression. Minute-stepping
// is bounded to ~13 months, which covers every real schedule.
export function nextRunUtc(expr: string, from: Date): Date | null {
  const f = cronFields(expr);
  if (!f) return null;
  const d = new Date(from);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  for (let i = 0; i < 400 * 24 * 60; i++) {
    const day = d.getUTCDay(); // 0 = Sunday
    const dowOk =
      fieldMatches(f.dow, day, 0, 6) || (day === 0 && fieldMatches(f.dow, 7, 0, 7));
    if (
      fieldMatches(f.minute, d.getUTCMinutes(), 0, 59) &&
      fieldMatches(f.hour, d.getUTCHours(), 0, 23) &&
      fieldMatches(f.dom, d.getUTCDate(), 1, 31) &&
      fieldMatches(f.month, d.getUTCMonth() + 1, 1, 12) &&
      dowOk
    ) {
      return d;
    }
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

// A short plain-English reading of the schedule for the common shapes we use;
// falls back to the raw expression otherwise.
export function humanizeCron(expr: string): string {
  const f = cronFields(expr);
  if (!f) return expr;
  const everyDay = f.dom === "*" && f.month === "*" && f.dow === "*";
  const minuteNum = /^\d+$/.test(f.minute) ? parseInt(f.minute, 10) : null;
  const hourNum = /^\d+$/.test(f.hour) ? parseInt(f.hour, 10) : null;
  if (everyDay && minuteNum != null && hourNum != null) {
    return `Daily at ${pad(hourNum)}:${pad(minuteNum)} UTC`;
  }
  const stepHour = f.hour.match(/^\*\/(\d+)$/);
  if (everyDay && stepHour && f.minute === "0") {
    return `Every ${stepHour[1]} hours`;
  }
  if (everyDay && f.hour === "*" && minuteNum != null) {
    return `Hourly at :${pad(minuteNum)} UTC`;
  }
  return `${expr} (UTC)`;
}
