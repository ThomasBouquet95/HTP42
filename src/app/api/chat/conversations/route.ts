import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  createGroupConversation,
  ensureDirectConversation,
  listConversationsFor,
} from "@/lib/airtable";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const conversations = await listConversationsFor(session.sub, session.memberCode);
  return NextResponse.json({ conversations });
}

// Two shapes:
//   { kind: "Direct", memberRecordId: "rec..." }  → reuse an existing 1:1 or create one
//   { kind: "Group",  title: "...", memberRecordIds: ["rec..", ...] }  → new group
const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("Direct"),
    memberRecordId: z.string().trim().regex(/^rec[A-Za-z0-9]{14}$/),
  }),
  z.object({
    kind: z.literal("Group"),
    title: z.string().trim().min(1).max(120),
    // A group with one other member is functionally a DM; force the
    // explicit DM flow there to keep dedupe working.
    memberRecordIds: z
      .array(z.string().trim().regex(/^rec[A-Za-z0-9]{14}$/))
      .min(2, "Pick at least 2 other members for a group, or use a direct message.")
      .max(50),
  }),
]);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const d = parsed.data;
  if (d.kind === "Direct") {
    if (d.memberRecordId === session.sub) {
      return NextResponse.json(
        { error: "Can't open a direct chat with yourself." },
        { status: 400 },
      );
    }
    const c = await ensureDirectConversation(session.sub, session.memberCode, d.memberRecordId);
    return NextResponse.json({ conversation: c });
  }
  // Group
  const c = await createGroupConversation(session.sub, d.title, d.memberRecordIds);
  return NextResponse.json({ conversation: c });
}
