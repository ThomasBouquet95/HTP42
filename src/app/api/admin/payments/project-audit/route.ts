import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { listAllInvoices, listPayments } from "@/lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only diagnostic: find payments whose own Project link disagrees with
// the project of the member invoice they settle. A member invoice derives its
// project from the staffing it's linked to (the source of truth), so any
// divergence means the payment was filed under the wrong project — exactly the
// ECS-2026-01 vs ECS-2026-05 case on payment #268. Gated by "payments" view.
export async function GET(request: Request) {
  const session = await requireAdminAction("payments", "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [payments, invoices] = await Promise.all([listPayments(), listAllInvoices()]);
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));

  type Row = {
    paymentCode: string;
    direction: string;
    beneficiary: string;
    paymentProjects: string;
    invoiceCode: string;
    invoiceProject: string;
    invoiceMember: string;
    staffingCode: string;
  };

  const mismatches: Row[] = [];
  let linkedPayments = 0; // payments that reference at least one member invoice
  let unlinkedPayments = 0; // payments with no linked invoice — can't be checked

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
      // The payment's project set should include the invoice's (staffing's)
      // project. If it doesn't, the payment is filed under the wrong project.
      if (!payProjects.includes(inv.projectCode)) {
        mismatches.push({
          paymentCode: p.paymentCode || p.id,
          direction: p.direction || "—",
          beneficiary: p.beneficiary || p.memberCodes.join(", ") || "—",
          paymentProjects: payProjects.join(", ") || "(none)",
          invoiceCode: inv.invoiceCode || inv.id,
          invoiceProject: inv.projectCode,
          invoiceMember: inv.memberName || inv.memberCode || "—",
          staffingCode: inv.staffingCode || "—",
        });
      }
    }
  }

  const wantsJson =
    new URL(request.url).searchParams.get("format") === "json" ||
    (request.headers.get("accept") ?? "").includes("application/json");

  const summary = {
    totalPayments: payments.length,
    linkedPayments,
    unlinkedPayments,
    mismatchCount: mismatches.length,
  };

  if (wantsJson) {
    return NextResponse.json({ summary, mismatches });
  }

  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const rowsHtml = mismatches
    .map(
      (r) => `<tr>
        <td>${esc(r.paymentCode)}</td>
        <td>${esc(r.direction)}</td>
        <td>${esc(r.beneficiary)}</td>
        <td><strong style="color:#b91c1c">${esc(r.paymentProjects)}</strong></td>
        <td>${esc(r.invoiceCode)}</td>
        <td><strong style="color:#047857">${esc(r.invoiceProject)}</strong></td>
        <td>${esc(r.staffingCode)}</td>
        <td>${esc(r.invoiceMember)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>Payment ↔ invoice project audit</title>
    <style>
      body{font:14px/1.5 system-ui,sans-serif;margin:2rem;color:#0f172a}
      h1{font-size:1.1rem} .muted{color:#64748b}
      table{border-collapse:collapse;margin-top:1rem;width:100%}
      th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left;font-size:13px}
      th{background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
      .ok{color:#047857;font-weight:600}.bad{color:#b91c1c;font-weight:600}
    </style></head><body>
    <h1>Payment ↔ invoice project audit</h1>
    <p class="muted">
      Payments settle a member invoice; the invoice's project comes from its staffing (source of truth).
      This lists payments whose own <em>Project</em> link disagrees with the linked invoice's project.
    </p>
    <p>
      ${summary.totalPayments} payments · ${summary.linkedPayments} linked to an invoice ·
      ${summary.unlinkedPayments} standalone (not checkable) ·
      <span class="${summary.mismatchCount === 0 ? "ok" : "bad"}">${summary.mismatchCount} mismatch${summary.mismatchCount === 1 ? "" : "es"}</span>
    </p>
    ${
      summary.mismatchCount === 0
        ? `<p class="ok">No mismatches. Every invoice-linked payment is filed under the same project as its invoice/staffing.</p>`
        : `<table><thead><tr>
            <th>Payment</th><th>Direction</th><th>Beneficiary</th>
            <th>Payment project</th><th>Invoice</th><th>Invoice project (staffing)</th>
            <th>Staffing</th><th>Invoice member</th>
          </tr></thead><tbody>${rowsHtml}</tbody></table>`
    }
  </body></html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
