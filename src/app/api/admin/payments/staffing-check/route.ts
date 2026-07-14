import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  listAllMembers,
  listAllStaffings,
  listAllTimesheets,
  listPaymentsRaw,
  listProjects,
} from "@/lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only investigation: payments filed under a project the associated
// member is NOT staffed on — e.g. #268 sits on ECS-2026-01 but Linda has no
// ECS-2026-01_… staffing. For each flagged payment we list the member's ACTUAL
// staffings and whether each has timesheets, so you can see which staffing the
// payment should really point at.
export async function GET(request: Request) {
  const session = await requireAdminAction("payments", "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [payments, members, staffings, timesheets, projects] = await Promise.all([
    listPaymentsRaw(),
    listAllMembers(),
    listAllStaffings(),
    listAllTimesheets(),
    listProjects(),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const projectCodeById = new Map(projects.map((p) => [p.id, p.projectCode]));
  // Member codes, longest first, for inferring the member from free text when a
  // payment has no Member link (many standalone payments only name them in the
  // beneficiary / comment, e.g. "Forinnovia SA (Linda Dib, DIBLI1)").
  const memberByCode = new Map(members.map((m) => [m.memberCode, m]));
  const memberCodesByLen = members
    .map((m) => m.memberCode)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  // member (id or code) -> their staffings.
  const staffingsByMemberId = new Map<string, typeof staffings>();
  const staffingsByMemberCode = new Map<string, typeof staffings>();
  for (const s of staffings) {
    for (const mid of s.memberRecordIds) {
      const arr = staffingsByMemberId.get(mid) ?? [];
      arr.push(s);
      staffingsByMemberId.set(mid, arr);
    }
    for (const mc of s.memberCodes) {
      const arr = staffingsByMemberCode.get(mc) ?? [];
      arr.push(s);
      staffingsByMemberCode.set(mc, arr);
    }
  }

  // staffing (id or code) -> timesheet status counts.
  const tsByStaffing = new Map<string, Map<string, number>>();
  const bump = (key: string, status: string) => {
    if (!key) return;
    const m = tsByStaffing.get(key) ?? new Map<string, number>();
    m.set(status, (m.get(status) ?? 0) + 1);
    tsByStaffing.set(key, m);
  };
  for (const t of timesheets) {
    bump(t.staffingRecordId, t.status || "—");
    bump(t.staffingCode, t.status || "—");
  }
  const tsFor = (s: { id: string; staffingCode: string }) => {
    const m = tsByStaffing.get(s.id) ?? tsByStaffing.get(s.staffingCode);
    if (!m) return { total: 0, breakdown: "" };
    let total = 0;
    const parts: string[] = [];
    for (const [st, n] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
      total += n;
      parts.push(`${n} ${st}`);
    }
    return { total, breakdown: parts.join(", ") };
  };

  type StaffingLine = { staffingCode: string; projectCode: string; timesheets: number; breakdown: string };
  type Row = {
    paymentCode: string;
    direction: string;
    beneficiary: string;
    memberLabel: string;
    memberSource: "linked" | "inferred from text";
    paymentProjects: string;
    memberStaffings: StaffingLine[];
  };

  const rows: Row[] = [];
  let withMember = 0;
  let noMember = 0;
  let memberHasNoStaffing = 0;

  for (const p of payments) {
    // Resolve the member: linked first, else inferred from beneficiary/comment.
    let member = p.memberRecordIds[0] ? memberById.get(p.memberRecordIds[0]) : undefined;
    let source: Row["memberSource"] = "linked";
    if (!member) {
      const hay = `${p.beneficiary} ${p.comment}`.toLowerCase();
      const hitCode = memberCodesByLen.find((c) => hay.includes(c.toLowerCase()));
      if (hitCode) {
        member = memberByCode.get(hitCode);
        source = "inferred from text";
      }
    }
    if (!member) {
      noMember += 1;
      continue;
    }
    withMember += 1;

    const payCodes = [...new Set(p.projectRecordIds.map((id) => projectCodeById.get(id) ?? id).filter(Boolean))];
    if (payCodes.length === 0) continue; // no project on the payment — nothing to compare

    const memStaffings = staffingsByMemberId.get(member.id) ?? staffingsByMemberCode.get(member.memberCode) ?? [];
    if (memStaffings.length === 0) {
      memberHasNoStaffing += 1;
    }
    const memberProjectCodes = new Set(memStaffings.map((s) => s.projectCode));

    // Flag when the payment's project isn't one the member is staffed on.
    const notStaffedOn = payCodes.some((c) => !memberProjectCodes.has(c));
    if (!notStaffedOn) continue;

    rows.push({
      paymentCode: p.paymentCode || p.id,
      direction: p.direction || "—",
      beneficiary: p.beneficiary || "—",
      memberLabel: `${member.fullName || member.memberCode}${member.memberCode ? ` (${member.memberCode})` : ""}`,
      memberSource: source,
      paymentProjects: payCodes.join(", "),
      memberStaffings: memStaffings
        .map((s) => {
          const ts = tsFor(s);
          return {
            staffingCode: s.staffingCode,
            projectCode: s.projectCode,
            timesheets: ts.total,
            breakdown: ts.breakdown,
          };
        })
        .sort((a, b) => b.timesheets - a.timesheets),
    });
  }

  rows.sort((a, b) => a.paymentCode.localeCompare(b.paymentCode, undefined, { numeric: true }));

  const summary = {
    totalPayments: payments.length,
    withMemberResolved: withMember,
    withoutMember: noMember,
    flagged: rows.length,
    memberHadNoStaffing: memberHasNoStaffing,
  };

  const wantsJson =
    new URL(request.url).searchParams.get("format") === "json" ||
    (request.headers.get("accept") ?? "").includes("application/json");
  if (wantsJson) return NextResponse.json({ summary, rows });

  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const rowsHtml = rows
    .map((r) => {
      const staff =
        r.memberStaffings.length === 0
          ? `<div style="color:#b91c1c">Member has NO staffings at all.</div>`
          : r.memberStaffings
              .map(
                (s) =>
                  `<div>${esc(s.staffingCode || "—")} <span class="muted">(${esc(s.projectCode || "—")})</span> — ${
                    s.timesheets > 0
                      ? `<strong style="color:#047857">${s.timesheets} timesheet${s.timesheets === 1 ? "" : "s"}</strong> <span class="muted">${esc(s.breakdown)}</span>`
                      : `<span style="color:#b91c1c">no timesheets</span>`
                  }</div>`,
              )
              .join("");
      return `<tr>
        <td>${esc(r.paymentCode)}</td>
        <td>${esc(r.direction)}</td>
        <td>${esc(r.beneficiary)}</td>
        <td>${esc(r.memberLabel)}${r.memberSource === "inferred from text" ? ' <span class="muted" title="Member not linked; matched from the beneficiary/comment text">(inferred)</span>' : ""}</td>
        <td><strong style="color:#b45309">${esc(r.paymentProjects)}</strong></td>
        <td>${staff}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>Payment ↔ member-staffing check</title>
    <style>
      body{font:14px/1.5 system-ui,sans-serif;margin:2rem;color:#0f172a;max-width:1200px}
      h1{font-size:1.15rem} .muted{color:#64748b}
      table{border-collapse:collapse;margin-top:1rem;width:100%}
      th,td{border:1px solid #e2e8f0;padding:6px 9px;text-align:left;font-size:12.5px;vertical-align:top}
      th{background:#f8fafc;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
      .ok{color:#047857;font-weight:600}.bad{color:#b91c1c;font-weight:600}
    </style></head><body>
    <h1>Payments filed under a project the member isn't staffed on</h1>
    <p class="muted">
      For each flagged payment: the project it's filed under vs. the member's actual staffings, and whether those
      staffings have timesheets. The staffing with timesheets is almost certainly the engagement the payment belongs to.
      Members without a Member link are inferred from the beneficiary / comment text (marked "inferred").
    </p>
    <p>
      ${summary.totalPayments} payments · ${summary.withMemberResolved} with a member ·
      ${summary.withoutMember} without a member (skipped) ·
      <span class="${summary.flagged === 0 ? "ok" : "bad"}">${summary.flagged} flagged</span>
      ${summary.memberHadNoStaffing > 0 ? `· ${summary.memberHadNoStaffing} whose member has no staffings` : ""}
    </p>
    ${
      rows.length === 0
        ? `<p class="ok">No payments found where the member isn't staffed on the payment's project.</p>`
        : `<table><thead><tr>
            <th>Payment</th><th>Dir</th><th>Beneficiary</th><th>Member</th>
            <th>Payment project</th><th>Member's staffings (timesheets?)</th>
          </tr></thead><tbody>${rowsHtml}</tbody></table>`
    }
  </body></html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
