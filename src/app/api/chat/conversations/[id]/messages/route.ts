import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getConversation,
  getConversationMemberIdsCached,
  listMessages,
  sendChatMessage,
} from "@/lib/airtable";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  // Read path uses a short-lived membership cache: with a 3 s message poll
  // and the cache TTL at 10 s, we collapse 3-4 reads into one without
  // making slow stale auth a real problem.
  const memberIds = await getConversationMemberIdsCached(id);
  if (!memberIds) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!memberIds.includes(session.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const messages = await listMessages(id);
  return NextResponse.json({ messages });
}

const sendSchema = z.object({
  body: z.string().min(1).max(8000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  // Writes always re-read the conversation membership uncached, so a member
  // removed seconds ago can't slip in one final message.
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!conv.memberRecordIds.includes(session.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const msg = await sendChatMessage(id, session.sub, parsed.data.body.trim());
  return NextResponse.json({ message: msg });
}
