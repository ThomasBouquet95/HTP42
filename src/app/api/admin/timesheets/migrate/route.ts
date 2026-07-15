import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  BULK_APPROVE_CUTOFF,
  bulkApproveUnderReviewBefore,
  migrateLegacyInvoicedTimesheets,
  migratePaidTimesheetsToApproved,
} from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

// Guarded one-shot migrations, selected by the confirm token:
//   RESET-INVOICED-TO-UNDER-REVIEW → legacy "Invoiced" timesheets back to Submitted.
//   RESET-PAID-TO-APPROVED         → "Paid" timesheets back to Approved (Paid is a
//                                    payment status, not a timesheet one).
//   APPROVE-BACKLOG-BEFORE-CUTOFF  → approve every Submitted week starting before
//                                    the backlog cutoff (one-off clean-up).
const schema = z.object({
  confirm: z.enum([
    "RESET-INVOICED-TO-UNDER-REVIEW",
    "RESET-PAID-TO-APPROVED",
    "APPROVE-BACKLOG-BEFORE-CUTOFF",
  ]),
});

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  try {
    const result =
      parsed.data.confirm === "APPROVE-BACKLOG-BEFORE-CUTOFF"
        ? await bulkApproveUnderReviewBefore(BULK_APPROVE_CUTOFF)
        : parsed.data.confirm === "RESET-PAID-TO-APPROVED"
          ? await migratePaidTimesheetsToApproved()
          : await migrateLegacyInvoicedTimesheets();
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e, "migrate timesheet statuses");
  }
}
