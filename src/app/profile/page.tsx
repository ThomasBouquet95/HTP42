import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMemberById } from "@/lib/airtable";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const member = await getMemberById(session.sub);
  if (!member) redirect("/login");

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-base sm:text-lg font-semibold mb-4">Your profile</h1>
      <ProfileForm initial={member} />
    </main>
  );
}
