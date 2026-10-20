import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { resendClientReview } from "@/lib/timesheet-review";

// Resend the client review request for one timesheet (admin action).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("timesheets", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const result = await resendClientReview(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Could not send the review request." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "resend the client review request");
  }
}
