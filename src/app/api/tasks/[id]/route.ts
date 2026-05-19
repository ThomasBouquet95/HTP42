import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/session";
import {
  deleteTask,
  getStaffingsForMember,
  getTaskById,
  TASK_PRIORITIES,
  TASK_STATUSES,
  updateTask,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/airtable";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20000).optional(),
  status: z.enum(TASK_STATUSES as [string, ...string[]]).optional(),
  priority: z
    .union([z.enum(TASK_PRIORITIES as [string, ...string[]]), z.literal("")])
    .optional(),
  dueDate: z.union([z.string().trim().min(1), z.null()]).optional(),
  effortHours: z.union([z.number().nonnegative(), z.null()]).optional(),
  projectRecordId: z.string().trim().optional(),
  assigneeRecordIds: z.array(z.string()).max(50).optional(),
});

async function canAccess(taskId: string, sub: string, memberCode: string, admin: boolean) {
  const task = await getTaskById(taskId);
  if (!task) return { task: null, allowed: false };
  if (admin) return { task, allowed: true };
  if (task.createdByRecordId === sub) return { task, allowed: true };
  if (task.assigneeRecordIds.includes(sub)) return { task, allowed: true };
  if (task.projectCode) {
    const myStaffings = await getStaffingsForMember(memberCode);
    if (myStaffings.some((s) => s.projectCode === task.projectCode)) {
      return { task, allowed: true };
    }
  }
  return { task, allowed: false };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const { task, allowed } = await canAccess(id, session.sub, session.memberCode, isAdmin(session));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Only the creator (or admin) can re-scope the task or change assignees /
  // title / description. Other allowed viewers can only flip status, priority,
  // due date, effort — the lightweight "work the task" actions.
  const isOwner = task.createdByRecordId === session.sub || isAdmin(session);
  if (!isOwner) {
    if (
      d.title !== undefined ||
      d.description !== undefined ||
      d.projectRecordId !== undefined ||
      d.assigneeRecordIds !== undefined
    ) {
      return NextResponse.json(
        { error: "Only the creator can change the task's title, description, project, or assignees." },
        { status: 403 },
      );
    }
  }

  await updateTask(id, {
    title: d.title,
    description: d.description,
    status: d.status as TaskStatus | undefined,
    priority: d.priority as TaskPriority | "" | undefined,
    dueDate: d.dueDate as string | null | undefined,
    effortHours: d.effortHours as number | null | undefined,
    projectRecordId: d.projectRecordId,
    assigneeRecordIds: d.assigneeRecordIds,
  });
  const updated = await getTaskById(id);
  return NextResponse.json({ ok: true, task: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const task = await getTaskById(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Delete is creator/admin only — viewers can't blow away each other's work.
  if (!isAdmin(session) && task.createdByRecordId !== session.sub) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteTask(id);
  return NextResponse.json({ ok: true });
}
