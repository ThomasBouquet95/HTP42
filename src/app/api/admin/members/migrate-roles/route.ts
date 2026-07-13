import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { migrateMemberRoles } from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

// One-shot migration of member roles to the new model:
//   Admin -> Managing Partner, Support Member -> Support, everything else
//   assigned -> Network Expert (unassigned left as-is). Idempotent + guarded by
//   a confirmation token. See migrateMemberRoles.
const schema = z.object({ confirm: z.literal("MIGRATE-MEMBER-ROLES") });

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  try {
    const result = await migrateMemberRoles();
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e, "migrate member roles");
  }
}
