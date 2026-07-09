import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listAllMembers, listSurveys } from "@/lib/airtable";
import { MemberReviewsClient, type MemberReviewData } from "./reviews-client";

export const dynamic = "force-dynamic";

export default async function AdminMemberReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const { member: initialCode } = await searchParams;
  const [members, surveys] = await Promise.all([listAllMembers(), listSurveys()]);
  const completed = surveys.filter((s) => s.completedAt);

  // Seed every network member so the left list shows everyone, even those
  // with no reviews yet. Reviews are the per-member ratings inside completed
  // client surveys, matched by member code.
  const byCode = new Map<string, MemberReviewData>();
  for (const m of members) {
    byCode.set(m.memberCode, {
      code: m.memberCode,
      name: m.fullName || m.memberCode,
      photo: m.photo?.url ?? null,
      reviews: [],
    });
  }
  for (const s of completed) {
    for (const mr of s.memberRatings) {
      // Skip empty ratings (respondent left this member blank).
      if (mr.grade == null && !mr.wentWell && !mr.improve) continue;
      const rec =
        byCode.get(mr.code) ??
        ({ code: mr.code, name: mr.name || mr.code, photo: null, reviews: [] } as MemberReviewData);
      rec.reviews.push({
        surveyId: s.id,
        projectCode: s.projectCode,
        projectName: s.projectName,
        recipientName: s.recipientName,
        recipientEmail: s.recipientEmail,
        completedAt: s.completedAt,
        grade: mr.grade,
        wentWell: mr.wentWell,
        improve: mr.improve,
      });
      byCode.set(mr.code, rec);
    }
  }

  const data = [...byCode.values()];
  const totalReviews = data.reduce((n, d) => n + d.reviews.length, 0);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="memberreviews" />
      <PageHeader title="Client review" subtitle={`· ${totalReviews} received`} />
      <MemberReviewsClient members={data} initialCode={initialCode ?? null} />
    </main>
  );
}
