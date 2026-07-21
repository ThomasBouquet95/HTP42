import { redirect } from "next/navigation";
import { canAccessAdminPanel, getSession } from "@/lib/auth";
import { getMemberById } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";

export default async function TimesheetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Re-fetch the photo on every render: Airtable attachment URLs are short-
  // lived and existing JWTs predate the photoUrl field on SessionPayload, so
  // pulling it server-side keeps the header avatar current without a re-login.
  const member = await getMemberById(session.sub);
  const photoUrl = member?.photo?.url ?? session.photoUrl ?? null;
  const canAccessAdmin = await canAccessAdminPanel(session);
  return (
    <>
      <AppHeader session={session} photoUrl={photoUrl} canAccessAdmin={canAccessAdmin} />
      {children}
    </>
  );
}
