import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { apiError, zodMessage } from "@/lib/errors";
import {
  createStaffing,
  CURRENCIES,
  PROJECT_ROLES,
  REVIEW_METHODS,
  SOW_STATUSES,
  STAFFING_STATUSES,
  type Currency,
  type ProjectRole,
  type ReviewMethod,
  type SowStatus,
  type StaffingStatus,
} from "@/lib/airtable";

const nullableNumber = z.union([z.number(), z.null()]).optional();
const nullableDate = z.union([z.string().trim().min(1), z.null()]).optional();

const schema = z.object({
  projectCode: z.string().trim().min(1).max(80),
  // Every staffing must be tied to exactly one Network Member. Without this
  // link the Staffing Code formula in Airtable falls back to "{Project}_"
  // and the row visually looks like a project sitting in the staffing
  // table — a real bug a user reported in the wild.
  memberRecordIds: z
    .array(z.string())
    .min(1, "A staffing must be linked to a network member.")
    .max(1, "A staffing must be linked to exactly one network member."),
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
  reviewMethod: z.union([z.enum(REVIEW_METHODS as [string, ...string[]]), z.literal("")]).default(""),
  reviewerName: z.string().trim().max(200).default(""),
  reviewerEmail: z.string().trim().max(320).default(""),
});

export async function POST(request: Request) {
  const session = await requireAdminAction("staffing", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  const d = parsed.data;
  try {
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
      reviewMethod: d.reviewMethod as ReviewMethod | "",
      reviewerName: d.reviewerName,
      reviewerEmail: d.reviewerEmail,
    });
    return NextResponse.json({ id });
  } catch (e) {
    return apiError(e, "save the staffing");
  }
}
