import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/session";
import {
  deleteChatMessage,
  getChatMessage,
  updateChatMessage,
} from "@/lib/airtable";

export const runtime = "nodejs";

// Edit and delete a chat message.
//
// Authorization:
//   - Edit: only the original sender can change a message body.
//   - Delete: the original sender, or an admin (so an admin can scrub
//     something inappropriate out of a project chat).
async function loadAndAuth(
  msgId: string,
  conversationId: string,
  callerId: string,
  callerIsAdmin: boolean,
  intent: "edit" | "delete",
) {
  const msg = await getChatMessage(msgId);
  if (!msg) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (msg.conversationId !== conversationId) {
    return { error: NextResponse.json({ error: "Wrong conversation" }, { status: 400 }) };
  }
  const isSender = msg.senderRecordId === callerId;
  const allowed = intent === "edit" ? isSender : isSender || callerIsAdmin;
  if (!allowed) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { msg };
}

const patchSchema = z.object({
  body: z.string().min(1).max(8000),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; msgId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id, msgId } = await params;
  const auth = await loadAndAuth(msgId, id, session.sub, isAdmin(session), "edit");
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const updated = await updateChatMessage(msgId, parsed.data.body.trim());
  return NextResponse.json({ message: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; msgId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id, msgId } = await params;
  const auth = await loadAndAuth(msgId, id, session.sub, isAdmin(session), "delete");
  if ("error" in auth) return auth.error;
  await deleteChatMessage(msgId);
  return NextResponse.json({ ok: true });
}
