import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStaffingsForMember } from "@/lib/airtable";
import { weekOverlapsRange, mondayOf, fridayOfWeek } from "@/lib/dates";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(request.url);
  const weekParam = url.searchParams.get("week"); // YYYY-MM-DD, any day in the week

  const staffings = await getStaffingsForMember(session.memberCode, true);

  if (!weekParam) return NextResponse.json({ staffings });

  const monday = mondayOf(weekParam);
  const friday = fridayOfWeek(monday);
  const filtered = staffings.filter((s) =>
    weekOverlapsRange(monday, friday, s.startDate, s.endDate),
  );
  return NextResponse.json({ staffings: filtered, week: { monday, friday } });
}
