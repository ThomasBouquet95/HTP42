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

// A flag marker present on EVERY project line. The AI summary used to add these
// unevenly (green sometimes missing); rendering the list in code guarantees each
// project shows its colour.
function flagMarker(flag: ProfitFlag | null): string {
  return flag === "red" ? "🔴" : flag === "amber" ? "🟡" : flag === "green" ? "🟢" : "⚪";
}

// The essential figures for one project line: contract, revenue/cost when
// present, and either the over-contract amount (red) or the margin left.
function projectFigures(p: DigestProject): string {
  const parts: string[] = [];
  parts.push(p.contractEur != null ? `Contract ${eur0(p.contractEur)}` : "No contract");
  if ((p.revenueToDateEur ?? 0) > 0) parts.push(`Revenue ${eur0(p.revenueToDateEur)}`);
  if ((p.costEur ?? 0) > 0) parts.push(`Costs ${eur0(p.costEur)}`);
  if (p.flag === "red" && p.contractEur != null && p.costEur != null && p.costEur > p.contractEur) {
    parts.push(`${eur0(p.costEur - p.contractEur)} over contract`);
  } else if (p.marginLeftEur != null && (p.contractEur != null || (p.costEur ?? 0) > 0)) {
    parts.push(`Margin left ${eur0(p.marginLeftEur)}`);
  }
  return parts.join(" | ");
}

// Deterministic Running / Planned / Completed sections. Rendered in code (not by
// the AI) so every project consistently carries its flag marker and figures.
// Also used as the whole body if the AI executive summary can't be produced.
export function renderDigestSections(model: DigestModel): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const row = (p: DigestProject) =>
    `<li style="margin:0 0 6px">${flagMarker(p.flag)} <strong>${esc(p.name)}</strong> ` +
    `<span style="color:#94a3b8">${esc(p.code)}</span> — ` +
    `<span style="color:#475569">${esc(projectFigures(p))}</span></li>`;
  const section = (title: string, items: DigestProject[]) => {
    if (!items.length) return "";
    return `<h3 style="margin:16px 0 6px;font-size:14px">${title} (${items.length})</h3><ul style="margin:0;padding-left:18px;list-style:none">${items.map(row).join("")}</ul>`;
  };
  return [
    section("Running", model.groups.running),
    section("Planned", model.groups.planned),
    section("Completed", model.groups.completed),
    section("Other", model.groups.other),
  ]
    .filter(Boolean)
    .join("\n");
}
