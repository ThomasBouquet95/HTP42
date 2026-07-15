import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { requestClientReviewForPayment } from "@/lib/timesheet-review";

export const runtime = "nodejs";

// (Re)send the client-review request email for the under-review timesheets
// behind a payment. Used from the Review · Client tab.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const result = await requestClientReviewForPayment(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
