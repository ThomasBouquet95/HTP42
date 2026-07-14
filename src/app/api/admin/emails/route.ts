import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { apiError, zodMessage } from "@/lib/errors";
import { setEmailTemplateOverride, resetEmailTemplateOverride } from "@/lib/airtable";
import { getEmailTemplateDef } from "@/lib/email-templates";

const schema = z.object({
  key: z.string().trim().min(1),
  action: z.enum(["save", "reset"]),
  subject: z.string().max(500).default(""),
  body: z.string().max(20000).default(""),
});

export async function POST(request: Request) {
  const session = await requireAdminAction("emails", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;
  if (!getEmailTemplateDef(d.key)) {
    return NextResponse.json({ error: "Unknown email template." }, { status: 400 });
  }

  try {
    if (d.action === "reset") {
      await resetEmailTemplateOverride(d.key);
    } else {
      await setEmailTemplateOverride(d.key, d.subject.trim(), d.body);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "save the email template");
  }
}
