import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { getRolePermissions } from "@/lib/airtable";
import { can } from "@/lib/permissions";
import { apiError } from "@/lib/errors";
import { saveClosingLine, saveMonthStatus, type MonthStatus } from "@/lib/closing-store";

export const runtime = "nodejs";

// Saves one editable piece of the monthly-closing dashboard: either a line's
// note + last-reminder date, or the month's global close status. Everything else
// on the dashboard is derived, so there is nothing else to persist.
export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const stored = await getRolePermissions();
  if (!can(session.role, "closing", "edit", stored)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const month = typeof b.month === "string" ? b.month : "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "A valid month (yyyy-MM) is required." }, { status: 400 });
  }

  try {
    if (b.type === "status") {
      const status = (["In progress", "Done", ""].includes(String(b.status ?? ""))
        ? String(b.status ?? "")
        : "") as MonthStatus["status"];
      await saveMonthStatus(month, { status, comment: typeof b.comment === "string" ? b.comment : "" });
      return NextResponse.json({ ok: true });
    }
    if (b.type === "line") {
      const projectCode = typeof b.projectCode === "string" ? b.projectCode : "";
      const memberCode = typeof b.memberCode === "string" ? b.memberCode : "";
      if (!projectCode && !memberCode) {
        return NextResponse.json({ error: "project and member are required." }, { status: 400 });
      }
      const lastReminderDate =
        typeof b.lastReminderDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.lastReminderDate)
          ? b.lastReminderDate
          : null;
      await saveClosingLine(month, projectCode, memberCode, {
        comment: typeof b.comment === "string" ? b.comment : "",
        lastReminderDate,
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown type." }, { status: 400 });
  } catch (e) {
    return apiError(e, "save monthly close");
  }
}
