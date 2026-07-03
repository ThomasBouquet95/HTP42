import { NextResponse } from "next/server";
import { z } from "zod";
import { getSurveyByToken, submitSurvey, type SurveyMemberRating } from "@/lib/airtable";

export const runtime = "nodejs";

// A grade is 0–5 in 0.5 steps (or null = not rated).
const grade = z
  .number()
  .min(0)
  .max(5)
  .refine((v) => Math.round(v * 2) === v * 2, "Grade must be in 0.5 steps.");

const memberSchema = z.object({
  code: z.string().max(80),
  grade: z.union([grade, z.null()]).optional(),
  wentWell: z.string().max(5000).default(""),
  improve: z.string().max(5000).default(""),
});

const bodySchema = z.object({
  overallGrade: grade,
  overallWentWell: z.string().max(5000).default(""),
  overallImprove: z.string().max(5000).default(""),
  members: z.array(memberSchema).max(50).default([]),
});

// Public — no auth. The token is the only gate and each link submits once.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await getSurveyByToken(token);
  if (!survey) return NextResponse.json({ error: "This survey link is invalid." }, { status: 404 });
  if (survey.completedAt) {
    return NextResponse.json({ error: "This survey has already been submitted." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid submission." },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Build member ratings from the survey's snapshot team (names are trusted
  // from the server, not the client), merging in the submitted grades/notes.
  const byCode = new Map(d.members.map((m) => [m.code, m]));
  const memberRatings: SurveyMemberRating[] = survey.members.map((m) => {
    const sub = byCode.get(m.code);
    return {
      code: m.code,
      name: m.name,
      grade: sub?.grade ?? null,
      wentWell: sub?.wentWell ?? "",
      improve: sub?.improve ?? "",
    };
  });

  const ok = await submitSurvey(token, {
    overallGrade: d.overallGrade,
    overallWentWell: d.overallWentWell,
    overallImprove: d.overallImprove,
    memberRatings,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "This survey has already been submitted." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
