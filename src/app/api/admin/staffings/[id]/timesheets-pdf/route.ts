import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { listAllTimesheets } from "@/lib/airtable";
import { generateTimesheetSummaryPdf } from "@/lib/timesheet-pdf";

export const runtime = "nodejs";

// Admin: download a PDF summary of every logged timesheet on a staffing —
// same layout as the summary attached to member invoice submissions
// (generateTimesheetSummaryPdf). Covers the officially-logged lifecycle
// (Submitted / Invoiced / Paid); Draft and Deleted are left out.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const all = await listAllTimesheets();
  const rows = all
    .filter(
      (t) =>
        t.staffingRecordId === id &&
        (t.status === "Submitted" || t.status === "Invoiced" || t.status === "Paid"),
    )
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No submitted timesheets on this staffing yet." },
      { status: 404 },
    );
  }

  const first = rows[0];
  try {
    const pdf = await generateTimesheetSummaryPdf(
      {
        memberName: first.memberName,
        memberCode: first.memberCode,
        amount: null,
        currency: "",
        comment: "",
        staffingCode: first.staffingCode,
        projectCode: first.projectCode,
        projectName: first.projectName,
        title: "Staffing timesheet summary",
        subtitle: first.memberName || first.memberCode,
      },
      rows,
    );

    const filename = `timesheets-${first.staffingCode || id}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Staffing timesheet PDF generation failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF generation failed." },
      { status: 500 },
    );
  }
}
