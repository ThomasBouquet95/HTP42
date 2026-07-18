import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { getPaymentById } from "@/lib/airtable";
import { notifyPaymentPaid } from "@/lib/payment-notify";

// Resend the payment recap email — to the invoices inbox and the accounting /
// Qonto CCs configured on the "payment_paid" template — for an existing
// payment, with the invoice PDF attached. Same email the system sends when a
// payment is marked Paid; this just re-triggers it on demand.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const payment = await getPaymentById(id);
    if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

    const result = await notifyPaymentPaid(payment);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Email failed to send." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "resend the payment email");
  }
}
