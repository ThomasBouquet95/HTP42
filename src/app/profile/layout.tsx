import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMemberById } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const member = await getMemberById(session.sub);
  const photoUrl = member?.photo?.url ?? session.photoUrl ?? null;
  return (
    <>
      <AppHeader session={session} photoUrl={photoUrl} />
      {children}
    </>
  );
}
