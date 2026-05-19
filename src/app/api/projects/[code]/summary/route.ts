import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/session";
import { getLedProjects, getProjectSummaryByCode } from "@/lib/airtable";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { code } = await params;
  if (!code) return NextResponse.json({ error: "Missing project code" }, { status: 400 });

  // The Project Summary surfaces all the team's hours, so it stays gated to
  // the project's Engagement Leads / Project Leads (admins can see anything).
  const led = await getLedProjects(session.sub, session.memberCode);
  const allowed = isAdmin(session) || led.some((p) => p.projectCode === code);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const summary = await getProjectSummaryByCode(code);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ summary });
}
