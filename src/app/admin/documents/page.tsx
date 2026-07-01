import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { listAllDocuments } from "@/lib/airtable";
import { DocumentSearchClient } from "./documents-client";

export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const documents = await listAllDocuments();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="documents" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Document search</h1>
        <span className="text-xs text-slate-500">
          · {documents.length} document{documents.length === 1 ? "" : "s"}
        </span>
      </div>
      <DocumentSearchClient documents={documents} />
    </main>
  );
}
