import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  CURRENCIES,
  deleteStaffing,
  getStaffingById,
  PROJECT_ROLES,
  SOW_STATUSES,
  STAFFING_STATUSES,
  updateStaffing,
  updateStaffingStatus,
  type Currency,
  type ProjectRole,
  type SowStatus,
  type StaffingStatus,
} from "@/lib/airtable";

const patchSchema = z.object({
  status: z.union([z.enum(STAFFING_STATUSES as [string, ...string[]]), z.literal("")]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  await updateStaffingStatus(id, parsed.data.status as StaffingStatus | "");
  return NextResponse.json({ ok: true });
}

const nullableNumber = z.union([z.number(), z.null()]).optional();
const nullableDate = z.union([z.string().trim().min(1), z.null()]).optional();

const schema = z.object({
  projectCode: z.string().trim().min(1).max(80),
  // Mirror the create schema: every staffing keeps exactly one linked
  // Network Member through its lifetime. An edit that tries to clear the
  // member is treated as a fresh validation failure, not a silent update.
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
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getStaffingById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const d = parsed.data;
  await updateStaffing(id, {
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
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await deleteStaffing(id);
  return NextResponse.json({ ok: true });
}
