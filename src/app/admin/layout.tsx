import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  return (
    <>
      <AppHeader session={session} />
      {children}
    </>
  );
}
