import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getConversation, listMessages, sendChatMessage } from "@/lib/airtable";

export const runtime = "nodejs";

// Auth helper: pulls the conversation and verifies the caller is a member.
// Returns the conversation, or a NextResponse to short-circuit the handler.
async function authorize(id: string, memberRecordId: string) {
  const conv = await getConversation(id);
  if (!conv) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!conv.memberRecordIds.includes(memberRecordId)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { conv };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  const result = await authorize(id, session.sub);
  if ("error" in result) return result.error;
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
  const result = await authorize(id, session.sub);
  if ("error" in result) return result.error;
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
