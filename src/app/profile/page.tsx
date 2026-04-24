import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getMemberById } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const member = await getMemberById(session.sub);
  if (!member) redirect("/login");

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Your profile</h1>
            <p className="text-sm text-slate-600 mt-1">
              Update your personal details. Member code and email are managed by
              an administrator.
            </p>
          </div>
          <Link href="/timesheets/mine" className="text-sm text-brand-600 hover:text-brand-700">
            ← Back to my timesheets
          </Link>
        </div>
        <ProfileForm initial={member} />
      </main>
    </>
  );
}
