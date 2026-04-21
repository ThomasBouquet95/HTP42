import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { getClientById } from "@/lib/airtable";
import { ClientForm } from "../client-form";

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Edit client</h1>
            <p className="text-sm text-slate-600 mt-1 font-mono">{client.clientCode}</p>
          </div>
          <Link href="/admin/clients" className="text-sm text-brand-600 hover:text-brand-700">
            ← Back
          </Link>
        </div>
        <ClientForm mode="edit" existing={client} />
      </main>
    </>
  );
}
