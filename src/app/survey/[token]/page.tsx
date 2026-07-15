import { getSurveyByToken } from "@/lib/airtable";
import { SurveyForm } from "./survey-form";

export const dynamic = "force-dynamic";

// Public, no-auth survey page reached via a unique token link. Lives outside
// /admin so it carries no app header/nav.
export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await getSurveyByToken(token);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
            HTP42
          </div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Client feedback</h1>
          {survey ? (
            <p className="mt-1 text-sm text-slate-500">
              {survey.projectName || survey.projectCode}
              {survey.recipientName ? ` · for ${survey.recipientName}` : ""}
            </p>
          ) : null}
        </div>

        {!survey ? (
          <Notice title="Invalid link" tone="error">
            This survey link isn&apos;t valid. Please check the link in your email or ask your HTP42
            contact for a new one.
          </Notice>
        ) : survey.completedAt ? (
          <Notice title="Already submitted" tone="ok">
            Thanks. This survey has already been completed. If you need to change something, contact
            your HTP42 representative.
          </Notice>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-600">
              Rate from 0 to 5 stars (half-stars allowed) and add any comments. Your feedback
              won&apos;t be shared with the working team, kept confidential.
            </p>
            <SurveyForm token={token} members={survey.members} />
          </>
        )}
      </div>
    </div>
  );
}

function Notice({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`rounded-xl border p-6 ${cls}`}>
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}
