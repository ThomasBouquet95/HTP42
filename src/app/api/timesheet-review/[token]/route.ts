import { NextResponse } from "next/server";
import { z } from "zod";
import {
  decideTimesheet,
  getStaffingById,
  getTimesheetByReviewToken,
} from "@/lib/airtable";

export const runtime = "nodejs";

// Public, no-auth endpoint for a client reviewer to approve/reject a timesheet
// via their emailed token link. Security: single-use (the token is cleared once
// a decision lands) + expiring (14 days) + only actionable while "Submitted".
const schema = z.object({
  action: z.enum(["approve", "reject"]),
  comment: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const ts = await getTimesheetByReviewToken(token);
  if (!ts) {
    // Unknown token, or already used (the token is cleared on decision).
    return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  }
  if (ts.status !== "Submitted") {
    return NextResponse.json(
      { error: "This timesheet is no longer awaiting review." },
      { status: 409 },
    );
  }
  if (ts.reviewTokenExpiresAt && new Date(ts.reviewTokenExpiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  const staffing = ts.staffingRecordId ? await getStaffingById(ts.staffingRecordId) : null;
  const reviewer = staffing?.reviewerName || staffing?.reviewerEmail || "Client reviewer";

  try {
    await decideTimesheet({
      recordId: ts.id,
      timesheetCode: ts.timesheetCode,
      staffingCode: ts.staffingCode,
      decision: parsed.data.action === "approve" ? "Approved" : "Rejected",
      reviewMethod: "Client",
      reviewedBy: reviewer,
      comment: parsed.data.comment,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("timesheet-review decision failed:", e);
    return NextResponse.json({ error: "Could not record your decision. Please try again." }, { status: 500 });
  }
}
