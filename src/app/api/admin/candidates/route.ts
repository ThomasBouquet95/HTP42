import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { createCandidate, type CandidateStatus } from "@/lib/airtable";
import { candidateCreateSchema } from "./schema";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAdminAction("candidates", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = candidateCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const id = await createCandidate(
      {
        fullName: d.fullName,
        email: d.email,
        phone: d.phone,
        linkedin: d.linkedin,
        country: d.country,
        source: d.source,
        expertise: d.expertise,
        status: d.status as CandidateStatus,
      },
      d.initialNote,
    );
    return NextResponse.json({ id });
  } catch (e) {
    return apiError(e, "save the candidate");
  }
}
