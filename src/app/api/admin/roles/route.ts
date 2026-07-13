import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { setRolePermissions } from "@/lib/airtable";
import { ADMIN_PAGE_KEYS, CONFIGURABLE_ADMIN_ROLES } from "@/lib/permissions";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

const permSchema = z.record(
  z.string(),
  z.object({ view: z.boolean(), edit: z.boolean() }),
);
const schema = z.object({
  role: z.enum(CONFIGURABLE_ADMIN_ROLES as [string, ...string[]]),
  perms: permSchema,
});

export async function POST(request: Request) {
  // Changing role permissions requires "edit" on the Settings page — the
  // locked-full roles (Managing Partner, Operating Partner) have it; others
  // only if the matrix grants them Settings edit.
  const session = await requireAdminAction("settings", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  // Keep only known page keys; force edit⇒view so the stored data is coherent.
  const clean: Record<string, { view: boolean; edit: boolean }> = {};
  for (const key of ADMIN_PAGE_KEYS) {
    const p = parsed.data.perms[key] ?? { view: false, edit: false };
    clean[key] = { view: p.view || p.edit, edit: p.edit };
  }

  try {
    await setRolePermissions(parsed.data.role, clean);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "save role permissions");
  }
}
