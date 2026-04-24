import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  createStaffing,
  CURRENCIES,
  PROJECT_ROLES,
  SOW_STATUSES,
  STAFFING_STATUSES,
  type Currency,
  type ProjectRole,
  type SowStatus,
  type StaffingStatus,
} from "@/lib/airtable";

const nullableNumber = z.union([z.number(), z.null()]).optional();
const nullableDate = z.union([z.string().trim().min(1), z.null()]).optional();

const schema = z.object({
  projectCode: z.string().trim().min(1).max(80),
  memberRecordIds: z.array(z.string()).min(1).max(1),
  roleInProject: z.string().trim().max(200).default(""),
  projectRole: z.union([z.enum(PROJECT_ROLES as [string, ...string[]]), z.literal("")]).default(""),
  ratePerDay: nullableNumber,
  currency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).default(""),
  daysAllocated: nullableNumber,
  fxToEur: nullableNumber,
  sowReference: z.string().trim().max(200).default(""),
  sowStatus: z.union([z.enum(SOW_STATUSES as [string, ...string[]]), z.literal("")]).default(""),
  startDate: nullableDate,
  endDate: nullableDate,
  status: z.union([z.enum(STAFFING_STATUSES as [string, ...string[]]), z.literal("")]).default(""),
  notes: z.string().max(5000).default(""),
});

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const id = await createStaffing({
    projectCode: d.projectCode,
    memberRecordIds: d.memberRecordIds,
    roleInProject: d.roleInProject,
    projectRole: d.projectRole as ProjectRole | "",
    ratePerDay: d.ratePerDay ?? null,
    currency: d.currency as Currency | "",
    daysAllocated: d.daysAllocated ?? null,
    fxToEur: d.fxToEur ?? null,
    sowReference: d.sowReference,
    sowStatus: d.sowStatus as SowStatus | "",
    startDate: d.startDate ?? null,
    endDate: d.endDate ?? null,
    status: d.status as StaffingStatus | "",
    notes: d.notes,
  });
  return NextResponse.json({ id });
}
