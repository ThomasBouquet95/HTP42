import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  createProject,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  CURRENCIES,
  SOW_SIGNED_OPTIONS,
  type Currency,
  type ProjectStatus,
  type ProjectType,
  type SowSigned,
} from "@/lib/airtable";

const nullableNumber = z.union([z.number(), z.null()]).optional();
const nullableDate = z.union([z.string().trim().min(1), z.null()]).optional();

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
  const id = await createProject({
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
  });
  return NextResponse.json({ id });
}
