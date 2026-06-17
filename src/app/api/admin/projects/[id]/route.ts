import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  deleteProject,
  getProjectById,
  updateProject,
  updateProjectStatus,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  CURRENCIES,
  SOW_SIGNED_OPTIONS,
  type Currency,
  type ProjectStatus,
  type ProjectType,
  type SowSigned,
} from "@/lib/airtable";

const patchSchema = z.object({
  status: z.union([z.enum(PROJECT_STATUSES as [string, ...string[]]), z.literal("")]),
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
  await updateProjectStatus(id, parsed.data.status as ProjectStatus | "");
  return NextResponse.json({ ok: true });
}

const nullableNumber = z.union([z.number(), z.null()]).optional();
const nullableDate = z.union([z.string().trim().min(1), z.null()]).optional();

const milestoneEntry = z.object({
  kind: z.literal("milestone"),
  milestone: z.string().max(200).default(""),
  percent: z.number().min(0).max(100),
  date: z.union([z.string().trim().min(1), z.null()]).optional(),
});
const monthEntry = z.object({
  kind: z.literal("month"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM."),
  percent: z.number().min(0).max(100),
});
const paymentScheduleSchema = z
  .array(z.union([milestoneEntry, monthEntry]))
  .max(120)
  .default([]);

const schema = z.object({
  projectCode: z.string().trim().min(1).max(80),
  projectName: z.string().trim().min(1).max(300),
  clientRecordIds: z.array(z.string()).max(5).default([]),
  projectLeaderRecordIds: z.array(z.string()).max(10).default([]),
  type: z.union([z.enum(PROJECT_TYPES as [string, ...string[]]), z.literal("")]).default(""),
  objective: z.string().max(5000).default(""),
  startDate: nullableDate,
  endDate: nullableDate,
  currency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).default(""),
  totalAmount: nullableNumber,
  fxToEur: nullableNumber,
  status: z.union([z.enum(PROJECT_STATUSES as [string, ...string[]]), z.literal("")]).default(""),
  sowSigned: z.union([z.enum(SOW_SIGNED_OPTIONS as [string, ...string[]]), z.literal("")]).default(""),
  sowValidityDate: nullableDate,
  paymentSchedule: paymentScheduleSchema,
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getProjectById(id);
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
  await updateProject(id, {
    projectCode: d.projectCode,
    projectName: d.projectName,
    clientRecordIds: d.clientRecordIds,
    projectLeaderRecordIds: d.projectLeaderRecordIds,
    type: d.type as ProjectType | "",
    objective: d.objective,
    startDate: d.startDate ?? null,
    endDate: d.endDate ?? null,
    currency: d.currency as Currency | "",
    totalAmount: d.totalAmount ?? null,
    fxToEur: d.fxToEur ?? null,
    status: d.status as ProjectStatus | "",
    sowSigned: d.sowSigned as SowSigned | "",
    sowValidityDate: d.sowValidityDate ?? null,
    paymentSchedule: d.paymentSchedule.map((e) =>
      e.kind === "milestone"
        ? { kind: "milestone" as const, milestone: e.milestone, percent: e.percent, date: e.date ?? null }
        : { kind: "month" as const, month: e.month, percent: e.percent },
    ),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
