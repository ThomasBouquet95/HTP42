// Pure model for the daily project-status digest email. Kept free of Airtable /
// Anthropic / React so the categorisation and the fallback rendering can be
// unit-tested. The route (src/app/api/cron/project-status-digest) supplies the
// live data, asks Claude to write the prose summary, and sends the mail.

import type { ProjectProfit, ProfitFlag } from "@/app/admin/cockpit/profitability";

export type DigestCategory = "running" | "planned" | "completed" | "other";

// Map a project's status onto the three headline buckets the digest reports.
// "On Hold" is an active engagement that is paused, so it sits under Running
// (flagged in the row), not Planned. Anything unrecognised falls to "other" and
// is reported separately rather than silently dropped.
export function categorizeProjectStatus(status: string): DigestCategory {
  const s = (status || "").trim().toLowerCase();
  if (s === "in progress" || s === "on hold") return "running";
  if (s === "planned" || s === "not started") return "planned";
  if (s === "completed") return "completed";
  return "other";
}

export type DigestProject = {
  code: string;
  name: string;
  status: string;
  category: DigestCategory;
  contractEur: number | null;
  revenueToDateEur: number | null;
  costEur: number | null;
  marginLeftEur: number | null;
  flag: ProfitFlag | null;
  headlineReason: string | null;
};

export type DigestModel = {
  date: string;
  groups: Record<DigestCategory, DigestProject[]>;
  counts: Record<DigestCategory, number>;
  atRisk: DigestProject[]; // running projects flagged amber/red, most severe first
};

type ProjectLike = { projectCode: string; projectName: string; status: string };

const flagRank: Record<ProfitFlag, number> = { red: 0, amber: 1, green: 2 };

// Build the digest model from every project (so planned work with no payments
// still shows) enriched with the profitability signal where one exists.
export function buildDigestModel(
  projects: ProjectLike[],
  profit: ProjectProfit[],
  date: string,
): DigestModel {
  const byCode = new Map<string, ProjectProfit>();
  for (const p of profit) byCode.set(p.code, p);

  const groups: Record<DigestCategory, DigestProject[]> = {
    running: [],
    planned: [],
    completed: [],
    other: [],
  };

  for (const pr of projects) {
    const category = categorizeProjectStatus(pr.status);
    const fin = byCode.get(pr.projectCode) ?? null;
    groups[category].push({
      code: pr.projectCode,
      name: pr.projectName || pr.projectCode,
      status: pr.status || "",
      category,
      contractEur: fin?.contractEur ?? null,
      revenueToDateEur: fin?.revenueToDateEur ?? null,
      costEur: fin?.costEur ?? null,
      marginLeftEur: fin?.marginLeftEur ?? null,
      flag: fin?.flag ?? null,
      headlineReason: fin?.reasons?.[0] ?? null,
    });
  }

  // Within Running, surface the riskiest first; elsewhere keep by name.
  groups.running.sort(
    (a, b) => (flagRank[a.flag ?? "green"] - flagRank[b.flag ?? "green"]) || a.name.localeCompare(b.name),
  );
  for (const k of ["planned", "completed", "other"] as const) {
    groups[k].sort((a, b) => a.name.localeCompare(b.name));
  }

  const counts: Record<DigestCategory, number> = {
    running: groups.running.length,
    planned: groups.planned.length,
    completed: groups.completed.length,
    other: groups.other.length,
  };

  const atRisk = groups.running
    .filter((p) => p.flag === "red" || p.flag === "amber")
    .sort((a, b) => flagRank[a.flag ?? "green"] - flagRank[b.flag ?? "green"]);

  return { date, groups, counts, atRisk };
}

// One-line count used as the email's opening headline and its subject helper.
export function digestHeadline(model: DigestModel): string {
  const c = model.counts;
  const parts = [`${c.running} running`, `${c.planned} planned`, `${c.completed} completed`];
  if (c.other) parts.push(`${c.other} other`);
  let line = parts.join(" · ");
  if (model.atRisk.length) line += ` — ${model.atRisk.length} need attention`;
  return line;
}

const eur0 = (v: number | null): string =>
  v == null ? "—" : `€${Math.round(v).toLocaleString("en-US")}`;

// Compact JSON handed to Claude to write the prose summary. Only the essentials.
export function digestPromptData(model: DigestModel): string {
  const slim = (p: DigestProject) => ({
    code: p.code,
    name: p.name,
    status: p.status,
    contractEur: p.contractEur,
    revenueToDateEur: p.revenueToDateEur,
    costEur: p.costEur,
    marginLeftEur: p.marginLeftEur,
    flag: p.flag,
    concern: p.headlineReason,
  });
  return JSON.stringify(
    {
      date: model.date,
      running: model.groups.running.map(slim),
      planned: model.groups.planned.map(slim),
      completed: model.groups.completed.map(slim),
      other: model.groups.other.map(slim),
    },
    null,
    0,
  );
}

// Deterministic HTML used when Claude is unavailable, so a digest always sends.
export function renderDigestHtmlFallback(model: DigestModel): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dot = (flag: ProfitFlag | null) => {
    const color = flag === "red" ? "#e11d48" : flag === "amber" ? "#d97706" : flag === "green" ? "#059669" : "#94a3b8";
    return `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${color};margin-right:6px"></span>`;
  };
  const row = (p: DigestProject) => {
    const fin =
      p.contractEur != null || p.costEur != null
        ? ` <span style="color:#64748b">(${eur0(p.revenueToDateEur)} rev · ${eur0(p.costEur)} cost · ${eur0(p.marginLeftEur)} left)</span>`
        : "";
    const concern = p.headlineReason ? `<div style="color:#b91c1c;font-size:12px;margin:2px 0 0 14px">${esc(p.headlineReason)}</div>` : "";
    return `<li style="margin:0 0 6px">${dot(p.flag)}<strong>${esc(p.name)}</strong> <span style="color:#94a3b8">${esc(p.code)} · ${esc(p.status)}</span>${fin}${concern}</li>`;
  };
  const section = (title: string, items: DigestProject[]) => {
    if (!items.length) return "";
    return `<h3 style="margin:16px 0 6px;font-size:14px">${title} (${items.length})</h3><ul style="margin:0;padding-left:18px">${items.map(row).join("")}</ul>`;
  };
  return [
    section("Running", model.groups.running),
    section("Planned", model.groups.planned),
    section("Completed", model.groups.completed),
    section("Uncategorised", model.groups.other),
  ]
    .filter(Boolean)
    .join("\n");
}
