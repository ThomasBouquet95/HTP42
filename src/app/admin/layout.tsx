import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { getMemberById } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  const member = await getMemberById(session.sub);
  const photoUrl = member?.photo?.url ?? session.photoUrl ?? null;
  return (
    <>
      <AppHeader session={session} photoUrl={photoUrl} />
      {children}
    </>
  );
}
