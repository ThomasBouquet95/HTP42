import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { listAllInvoices, listPayments, listProjects } from "@/lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only diagnostic for the systemic payment↔project mismatch.
//
// Three project values are compared per payment that settles a member invoice:
//   • payment project  — the Project link on the Payment record (frozen when
//                         the payment was created/imported).
//   • invoice link     — the Project link stored ON the invoice record (also
//                         frozen at creation).
//   • staffing project — the invoice's staffing's CURRENT project. This is the
//                         source of truth the app displays; it's read live.
//
// A payment is flagged when its project doesn't include the staffing's live
// project. We then classify WHY:
//   • "staffing re-pointed" — payment == invoice link, but the staffing now
//     points at a different project. Root cause: the staffing was moved after
//     the payment/invoice were created; their frozen links didn't follow.
//   • "payment ≠ invoice"   — the payment's project doesn't even match the
//     invoice's own frozen link. Root cause: the payment was created/imported
//     with a project chosen independently of the invoice it settles.
// and guess the payment's SOURCE (auto-flow vs manual/import) from its shape.
export async function GET(request: Request) {
  const session = await requireAdminAction("payments", "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [payments, invoices, projects] = await Promise.all([
    listPayments(),
    listAllInvoices(),
    listProjects(),
  ]);
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const projectCodeById = new Map(projects.map((p) => [p.id, p.projectCode]));

  type Row = {
    paymentCode: string;
    direction: string;
    beneficiary: string;
    paymentProject: string;
    invoiceCode: string;
    invoiceLinkProject: string;
    staffingProject: string;
    hasStaffing: boolean;
    invoiceMember: string;
    classification: "staffing re-pointed" | "payment ≠ invoice" | "other";
    source: string;
  };

  const mismatches: Row[] = [];
  let linkedPayments = 0;
  let unlinkedPayments = 0;

  const guessSource = (comment: string, invoiceReference: string): string => {
    if (/^From invoice submission:/i.test(comment)) return "auto-flow (invoice submission)";
    if (invoiceReference) return "manual / import (has invoice ref)";
    return "manual / import";
  };

  for (const p of payments) {
    if (p.memberInvoiceRecordIds.length === 0) {
      unlinkedPayments += 1;
      continue;
    }
    linkedPayments += 1;
    const payProjects = p.projectCodes.filter(Boolean);
    for (const invId of p.memberInvoiceRecordIds) {
      const inv = invoiceById.get(invId);
      if (!inv || !inv.projectCode) continue;
      const staffingProject = inv.projectCode; // live (staffing-derived when a staffing is linked)
      if (payProjects.includes(staffingProject)) continue; // consistent — skip

      const invoiceLinkProject = projectCodeById.get(inv.projectRecordId) ?? "";
      const classification: Row["classification"] =
        invoiceLinkProject && payProjects.includes(invoiceLinkProject) && invoiceLinkProject !== staffingProject
          ? "staffing re-pointed"
          : !payProjects.includes(invoiceLinkProject)
            ? "payment ≠ invoice"
            : "other";

      mismatches.push({
        paymentCode: p.paymentCode || p.id,
        direction: p.direction || "—",
        beneficiary: p.beneficiary || p.memberCodes.join(", ") || "—",
        paymentProject: payProjects.join(", ") || "(none)",
        invoiceCode: inv.invoiceCode || inv.id,
        invoiceLinkProject: invoiceLinkProject || "(none)",
        staffingProject,
        hasStaffing: !!inv.staffingRecordId,
        invoiceMember: inv.memberName || inv.memberCode || "—",
        classification,
        source: guessSource(p.comment, p.invoiceReference),
      });
    }
  }

  // Aggregate the "why" so the pattern is obvious at a glance.
  const tally = (key: (r: Row) => string) => {
    const m = new Map<string, number>();
    for (const r of mismatches) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byClass = tally((r) => r.classification);
  const bySource = tally((r) => r.source);
  const byPair = tally((r) => `${r.paymentProject}  →  ${r.staffingProject}`);
  const noStaffing = mismatches.filter((r) => !r.hasStaffing).length;

  const summary = {
    totalPayments: payments.length,
    linkedPayments,
    unlinkedPayments,
    mismatchCount: mismatches.length,
    byClassification: Object.fromEntries(byClass),
    bySource: Object.fromEntries(bySource),
    invoicesWithoutStaffingLink: noStaffing,
  };

  const wantsJson =
    new URL(request.url).searchParams.get("format") === "json" ||
    (request.headers.get("accept") ?? "").includes("application/json");
  if (wantsJson) return NextResponse.json({ summary, byPair, mismatches });

  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const clsColor = (c: string) =>
    c === "staffing re-pointed" ? "#b45309" : c === "payment ≠ invoice" ? "#b91c1c" : "#475569";
  const list = (pairs: [string, number][]) =>
    pairs.map(([k, n]) => `<li><code>${esc(k)}</code> — <strong>${n}</strong></li>`).join("");

  const rowsHtml = mismatches
    .map(
      (r) => `<tr>
        <td>${esc(r.paymentCode)}</td>
        <td>${esc(r.direction)}</td>
        <td>${esc(r.beneficiary)}</td>
        <td><strong style="color:#b91c1c">${esc(r.paymentProject)}</strong></td>
        <td>${esc(r.invoiceLinkProject)}</td>
        <td><strong style="color:#047857">${esc(r.staffingProject)}</strong>${r.hasStaffing ? "" : " <span style='color:#94a3b8'>(no staffing link)</span>"}</td>
        <td>${esc(r.invoiceCode)}</td>
        <td>${esc(r.invoiceMember)}</td>
        <td style="color:${clsColor(r.classification)};font-weight:600">${esc(r.classification)}</td>
        <td class="muted">${esc(r.source)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>Payment ↔ invoice project audit</title>
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
    <h1>Payment ↔ invoice project audit</h1>
    <p class="muted">
      A payment settles a member invoice; the invoice's project comes from its staffing (source of truth).
      Flagged: payments whose <em>Project</em> link doesn't include the linked invoice's staffing project.
    </p>
    <p>
      ${summary.totalPayments} payments · ${summary.linkedPayments} linked to an invoice ·
      ${summary.unlinkedPayments} standalone (not checkable) ·
      <span class="${summary.mismatchCount === 0 ? "ok" : "bad"}">${summary.mismatchCount} mismatch${summary.mismatchCount === 1 ? "" : "es"}</span>
    </p>
    ${
      summary.mismatchCount === 0
        ? `<p class="ok">No mismatches. Every invoice-linked payment matches its invoice/staffing project.</p>`
        : `
      <h2>Why — by root cause</h2><ul>${list(byClass)}</ul>
      <p class="muted" style="font-size:12px">
        <strong>staffing re-pointed</strong>: payment matches the invoice's own (frozen) project link, but the
        staffing was later moved to a different project — the frozen links didn't follow.<br/>
        <strong>payment ≠ invoice</strong>: the payment's project doesn't even match the invoice's own link — the
        payment was created/imported with a project chosen independently of the invoice.
      </p>
      <h2>Why — by payment source</h2><ul>${list(bySource)}</ul>
      <p class="muted" style="font-size:12px">${summary.invoicesWithoutStaffingLink} of the flagged invoices have no staffing link at all (pure legacy/import rows).</p>
      <h2>Project pairs (payment → staffing), most common first</h2><ul>${list(byPair)}</ul>
      <h2>All mismatches</h2>
      <table><thead><tr>
        <th>Payment</th><th>Dir</th><th>Beneficiary</th>
        <th>Payment project</th><th>Invoice link project</th><th>Staffing project (live)</th>
        <th>Invoice</th><th>Member</th><th>Root cause</th><th>Payment source</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>`
    }
  </body></html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
