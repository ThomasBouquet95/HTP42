import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { ClientForm } from "../client-form";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">New client</h1>
          <Link href="/admin/clients" className="text-sm text-brand-600 hover:text-brand-700">
            ← Back
          </Link>
        </div>
        <ClientForm mode="create" />
      </main>
    </>
  );
}
