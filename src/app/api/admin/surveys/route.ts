import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import {
  createSurveyRecipient,
  getProjectTeam,
  listProjects,
  markSurveyEmail,
} from "@/lib/airtable";
import { env } from "@/lib/env";
import { sendMailViaGraph } from "@/lib/email";
import { resolveEmail } from "@/lib/email-templates-server";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

const schema = z.object({
  projectCode: z.string().trim().min(1, "Pick a project."),
  recipients: z
    .array(
      z.object({
        name: z.string().trim().max(200).default(""),
        email: z.string().trim().email("Enter a valid email."),
      }),
    )
    .min(1, "Add at least one recipient."),
});

export async function POST(request: Request) {
  const session = await requireAdminAction("surveys", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const { projectCode, recipients } = parsed.data;

  try {
    const [projects, members] = await Promise.all([listProjects(), getProjectTeam(projectCode)]);
    const project = projects.find((p) => p.projectCode === projectCode);
    if (!project) return NextResponse.json({ error: "Unknown project." }, { status: 400 });
    const projectName = project.projectName;

    let sent = 0;
    const failures: string[] = [];
    for (const r of recipients) {
      try {
        const { id, token } = await createSurveyRecipient({
          projectCode,
          projectName,
          recipientName: r.name,
          recipientEmail: r.email,
          members,
        });
        const link = `${env.appUrl}/survey/${token}`;
        const { name, subject, textBody, htmlBody, cc, from } = await resolveEmail("survey_invite", {
          who: r.name || "there",
          projectCode,
          projectNameSuffix: projectName ? `: ${projectName}` : "",
          projectNamePhrase: projectName ? ` on ${projectName}` : "",
          link,
        });
        const res = await sendMailViaGraph({
          to: r.email,
          cc,
          from,
          subject,
          textBody,
          htmlBody,
          logLabel: name,
        });
        await markSurveyEmail(id, res.ok ? { ok: true } : { ok: false, error: res.error });
        if (!res.ok) failures.push(`${r.email}: ${res.error}`);
        sent += 1;
      } catch (e) {
        failures.push(
          `${r.email}: ${e instanceof Error ? e.message : "could not create the survey recipient"}`,
        );
      }
    }

    return NextResponse.json({ created: sent, failures });
  } catch (e) {
    return apiError(e, "send the surveys");
  }
}
