import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { apiError, zodMessage } from "@/lib/errors";
import { SUPPORT_TICKET_STATUSES, updateSupportTicketStatus } from "@/lib/airtable";

const schema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES as unknown as [string, ...string[]]),
});

// Triage a ticket's status. Gated behind the same "settings" edit permission as
// the Roles & access page where the request list lives.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("settings", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  try {
    await updateSupportTicketStatus(id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "update the ticket");
  }
}
