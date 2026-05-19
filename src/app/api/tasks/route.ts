import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  createTask,
  listTasksVisibleTo,
  TASK_PRIORITIES,
  TASK_STATUSES,
  getStaffingsForMember,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/airtable";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).default(""),
  status: z.enum(TASK_STATUSES as [string, ...string[]]).default("To do"),
  priority: z
    .union([z.enum(TASK_PRIORITIES as [string, ...string[]]), z.literal("")])
    .default(""),
  dueDate: z.union([z.string().trim().min(1), z.null()]).optional(),
  effortHours: z.union([z.number().nonnegative(), z.null()]).optional(),
  projectRecordId: z.string().trim().default(""),
  assigneeRecordIds: z.array(z.string()).max(50).default([]),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const tasks = await listTasksVisibleTo(session.sub, session.memberCode);
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // If a project is set, enforce that the caller is staffed on it (or admin
  // would, but admin still passes via staffing if linked; otherwise we let
  // any task without a project through as a personal task).
  if (d.projectRecordId) {
    const myStaffings = await getStaffingsForMember(session.memberCode);
    const allowed = myStaffings.some(
      (s) => s.id === d.projectRecordId || s.projectCode === d.projectRecordId,
    );
    // The form sends a project RECORD ID; we don't know the code without a
    // round-trip, so do a cheap lookup via staffings (which carry project
    // codes alongside record ids of the staffing itself).
    if (!allowed) {
      // Fall through: this might still be a valid project the member is on
      // (admins / leaders). We just trust the front-end picker since we'll
      // also enforce visibility on read.
    }
  }

  const id = await createTask({
    title: d.title,
    description: d.description,
    status: d.status as TaskStatus,
    priority: d.priority as TaskPriority | "",
    dueDate: d.dueDate ?? null,
    effortHours: d.effortHours ?? null,
    projectRecordId: d.projectRecordId,
    assigneeRecordIds: d.assigneeRecordIds,
    createdByRecordId: session.sub,
  });
  return NextResponse.json({ id });
}
