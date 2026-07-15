import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  backfillPaymentProjects,
  listAllInvoices,
  listPaymentsRaw,
  listProjects,
} from "@/lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only diagnostic for the payment ↔ staffing linkage.
//
// When a member submits an invoice they pick a STAFFING (member + project +
// SOW). The invoice links that staffing; the payment that settles it must link
// the SAME staffing, and its project must be that staffing's project. This
// audit flags every invoice-linked payment where the staffing link is missing/
// wrong, or the project doesn't match the staffing's project.
export async function GET(request: Request) {
  const session = await requireAdminAction("payments", "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Raw payments (stored links, no inheritance applied) so the audit sees the
  // real stored state even though listPayments resolves it on read.
  const [payments, invoices, projects] = await Promise.all([
    listPaymentsRaw(),
    listAllInvoices(),
    listProjects(),
  ]);
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const projectCodeById = new Map(projects.map((p) => [p.id, p.projectCode]));
  const knownProjectCodes = new Set(projects.map((p) => p.projectCode).filter(Boolean));
  // Staffing record id -> staffing code / project code, learned from invoices
  // (which carry both, staffing-derived). Enough to label the payment's current
  // staffing without a separate staffing fetch.
  const staffingCodeById = new Map<string, string>();
  const projectCodeByStaffingId = new Map<string, string>();
  for (const i of invoices) {
    if (i.staffingRecordId) {
      if (i.staffingCode) staffingCodeById.set(i.staffingRecordId, i.staffingCode);
      if (i.projectCode) projectCodeByStaffingId.set(i.staffingRecordId, i.projectCode);
    }
  }
  const codeOfProject = (id: string) => projectCodeById.get(id) ?? id;
  const codeOfStaffing = (id: string) => staffingCodeById.get(id) ?? id;

  type Reason = "no staffing link" | "wrong staffing" | "wrong project";
  type Row = {
    paymentCode: string;
    direction: string;
    beneficiary: string;
    invoiceCode: string;
    invoiceMember: string;
    staffingHave: string;
    staffingShould: string;
    projectHave: string;
    projectShould: string;
    reason: Reason;
  };

  const mismatches: Row[] = [];
  let linkedPayments = 0;
  let unlinkedPayments = 0;
  let invoicesWithoutStaffing = 0;

  for (const p of payments) {
    if (p.memberInvoiceRecordIds.length === 0) {
      unlinkedPayments += 1;
      continue;
    }
    linkedPayments += 1;
    // The invoice this payment settles → the staffing it should carry.
    let inv = null as (typeof invoices)[number] | null;
    for (const invId of p.memberInvoiceRecordIds) {
      const found = invoiceById.get(invId);
      if (found) {
        inv = found;
        break;
      }
    }
    if (!inv) continue;
    const shouldStaffingId = inv.staffingRecordId;
    if (!shouldStaffingId) {
      invoicesWithoutStaffing += 1; // invoice itself has no staffing — can't check
      continue;
    }
    const shouldProjectCode = inv.projectCode || projectCodeByStaffingId.get(shouldStaffingId) || "";
    const shouldProjectId = shouldProjectCode
      ? projects.find((pr) => pr.projectCode === shouldProjectCode)?.id ?? ""
      : "";

    const staffingOk = p.staffingRecordIds.includes(shouldStaffingId);
    const projectOk = shouldProjectId ? p.projectRecordIds.includes(shouldProjectId) : true;
    if (staffingOk && projectOk) continue; // consistent

    const reason: Reason = !staffingOk
      ? p.staffingRecordIds.length === 0
        ? "no staffing link"
        : "wrong staffing"
      : "wrong project";

    mismatches.push({
      paymentCode: p.paymentCode || p.id,
      direction: p.direction || "—",
      beneficiary: p.beneficiary || p.memberCodes.join(", ") || "—",
      invoiceCode: inv.invoiceCode || inv.id,
      invoiceMember: inv.memberName || inv.memberCode || "—",
      staffingHave: p.staffingRecordIds.map(codeOfStaffing).join(", ") || "(none)",
      staffingShould: codeOfStaffing(shouldStaffingId),
      projectHave: p.projectRecordIds.map(codeOfProject).join(", ") || "(none)",
      projectShould: shouldProjectCode || "(unresolved)",
      reason,
    });
  }

  const tally = (key: (r: Row) => string) => {
    const m = new Map<string, number>();
    for (const r of mismatches) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byReason = tally((r) => r.reason);
  // Target project codes that don't exist as a Project record — the backfill
  // can set the staffing but not the project link for these.
  const unresolvedTargets = [...new Set(mismatches.map((r) => r.projectShould))]
    .filter((c) => c && c !== "(unresolved)" && !knownProjectCodes.has(c))
    .sort();

  const summary = {
    totalPayments: payments.length,
    linkedPayments,
    unlinkedPayments,
    mismatchCount: mismatches.length,
    byReason: Object.fromEntries(byReason),
    invoicesWithoutStaffing,
    unresolvedTargetProjects: unresolvedTargets,
  };

  const wantsJson =
    new URL(request.url).searchParams.get("format") === "json" ||
    (request.headers.get("accept") ?? "").includes("application/json");
  if (wantsJson) return NextResponse.json({ summary, mismatches });

  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const reasonColor = (r: Reason) =>
    r === "no staffing link" ? "#b91c1c" : r === "wrong staffing" ? "#b45309" : "#7c3aed";
  const list = (pairs: [string, number][]) =>
    pairs.map(([k, n]) => `<li><code>${esc(k)}</code> — <strong>${n}</strong></li>`).join("");

  const rowsHtml = mismatches
    .map(
      (r) => `<tr>
        <td>${esc(r.paymentCode)}</td>
        <td>${esc(r.direction)}</td>
        <td>${esc(r.beneficiary)}</td>
        <td>${esc(r.invoiceCode)}</td>
        <td>${esc(r.invoiceMember)}</td>
        <td><strong style="color:#b91c1c">${esc(r.staffingHave)}</strong></td>
        <td><strong style="color:#047857">${esc(r.staffingShould)}</strong></td>
        <td>${esc(r.projectHave)}</td>
        <td><strong style="color:#047857">${esc(r.projectShould)}</strong></td>
        <td style="color:${reasonColor(r.reason)};font-weight:600">${esc(r.reason)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>Payment ↔ staffing audit</title>
    <style>
      body{font:14px/1.5 system-ui,sans-serif;margin:2rem;color:#0f172a;max-width:1200px}
      h1{font-size:1.15rem} h2{font-size:.95rem;margin-top:1.5rem} .muted{color:#64748b}
      table{border-collapse:collapse;margin-top:.75rem;width:100%}
      th,td{border:1px solid #e2e8f0;padding:6px 9px;text-align:left;font-size:12.5px;vertical-align:top}
      th{background:#f8fafc;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
      code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px}
      ul{margin:.4rem 0}
      .ok{color:#047857;font-weight:600}.bad{color:#b91c1c;font-weight:600}
    </style></head><body>
    <h1>Payment ↔ staffing audit</h1>
    <p class="muted">
      A member picks a <strong>staffing</strong> when submitting an invoice. The payment that settles it must link
      the <em>same staffing</em>, and its project must be that staffing's project. Flagged below: payments whose
      staffing link is missing/wrong, or whose project doesn't match the staffing.
    </p>
    <p>
      ${summary.totalPayments} payments · ${summary.linkedPayments} settle an invoice ·
      ${summary.unlinkedPayments} standalone (not checkable) ·
      <span class="${summary.mismatchCount === 0 ? "ok" : "bad"}">${summary.mismatchCount} to fix</span>
    </p>

    ${
      unresolvedTargets.length > 0
        ? `<div style="border:1px solid #fca5a5;background:#fef2f2;color:#7f1d1d;padding:10px 14px;border-radius:8px;margin:.75rem 0">
        <strong>${unresolvedTargets.length} target project${unresolvedTargets.length === 1 ? "" : "s"} have no matching Project record.</strong>
        The backfill can set these payments' staffing but not their project link until the Project exists (or the staffing's
        project code is corrected): <div style="margin-top:6px">${unresolvedTargets.map((c) => `<code>${esc(c)}</code>`).join(" · ")}</div>
      </div>`
        : ""
    }

    <h2>Fix the stored records</h2>
    <p class="muted" style="font-size:12px">
      This links each invoice-settling payment to its invoice's staffing and sets the project from that staffing.
      The app already derives these on the fly; this repairs the underlying Airtable records. Dry-run first.
    </p>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:.5rem 0">
      <button id="dry" type="button" style="cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f172a;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600">1 · Dry run (preview)</button>
      <button id="apply" type="button" style="cursor:pointer;border:1px solid #b91c1c;background:#b91c1c;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600">2 · Apply fixes</button>
      <span id="status" class="muted" style="font-size:12px"></span>
    </div>
    <pre id="result" style="display:none;background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:6px;font-size:12px;overflow:auto;max-height:360px"></pre>
    <script>
      (function () {
        var path = ${JSON.stringify(new URL(request.url).pathname)};
        var dry = document.getElementById("dry");
        var apply = document.getElementById("apply");
        var status = document.getElementById("status");
        var result = document.getElementById("result");
        function run(applyFlag) {
          if (applyFlag && !window.confirm("Link each invoice-settling payment to its staffing and set its project, in Airtable? Run a dry run first if you haven't.")) return;
          status.textContent = applyFlag ? "Applying…" : "Running dry run…";
          dry.disabled = apply.disabled = true;
          fetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(applyFlag ? { confirm: "APPLY" } : {}),
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              result.style.display = "block";
              result.textContent = JSON.stringify(d, null, 2);
              status.textContent = d.apply
                ? ("Applied. " + (d.updated || 0) + " payment(s) updated. Reload to re-audit.")
                : ((d.toFix || 0) + " payment(s) would change" + (d.unresolved ? (", " + d.unresolved + " unresolved") : "") + ". Review below, then Apply.");
            })
            .catch(function (e) { status.textContent = "Failed: " + e; })
            .finally(function () { dry.disabled = apply.disabled = false; });
        }
        dry.addEventListener("click", function () { run(false); });
        apply.addEventListener("click", function () { run(true); });
      })();
    </script>

    ${
      summary.mismatchCount === 0
        ? `<p class="ok">No payments to fix. Every invoice-settling payment links its invoice's staffing and matches its project.</p>`
        : `
      <h2>By reason</h2><ul>${list(byReason)}</ul>
      <p class="muted" style="font-size:12px">
        <strong>no staffing link</strong>: payment has no staffing at all (the old behaviour, only a project was set).<br/>
        <strong>wrong staffing</strong>: payment links a different staffing than its invoice.<br/>
        <strong>wrong project</strong>: staffing is right but the project link doesn't match the staffing's project.
      </p>
      ${summary.invoicesWithoutStaffing > 0 ? `<p class="muted" style="font-size:12px">${summary.invoicesWithoutStaffing} payment(s) skipped: their invoice has no staffing link to inherit.</p>` : ""}
      <h2>All payments to fix</h2>
      <table><thead><tr>
        <th>Payment</th><th>Dir</th><th>Beneficiary</th><th>Invoice</th><th>Member</th>
        <th>Staffing (have)</th><th>Staffing (should)</th><th>Project (have)</th><th>Project (should)</th><th>Reason</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>`
    }
  </body></html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

// Backfill: link every invoice-settling payment to its invoice's staffing and
// set its project from that staffing. Dry-run by default; {"confirm":"APPLY"}
// persists. Requires "payments" edit.
export async function POST(request: Request) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  const apply = body.confirm === "APPLY";
  const result = await backfillPaymentProjects(apply);
  return NextResponse.json({ apply, ...result });
}
