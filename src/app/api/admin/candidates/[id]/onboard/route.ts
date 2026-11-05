import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { onboardCandidateAsMember } from "@/lib/airtable";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";

// Turn a candidate into a Network Member with no data re-entry. Needs edit
// rights on BOTH candidates and members, since it creates a member record.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("candidates", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const memberEdit = await requireAdminAction("members", "edit");
  if (!memberEdit) {
    return NextResponse.json(
      { error: "You need edit access to Members to onboard a candidate." },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const result = await onboardCandidateAsMember(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ memberId: result.memberId, memberCode: result.memberCode });
  } catch (e) {
    return apiError(e, "onboard the candidate");
  }
}
