import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listAllDocuments } from "@/lib/airtable";
import { DocumentSearchClient } from "./documents-client";

export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage() {
  const access = await requireAdminPage("documents");
  if (!access) redirect("/admin");

  const documents = await listAllDocuments();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="documents" />
      <PageHeader
        title="Document search"
        subtitle={`· ${documents.length} document${documents.length === 1 ? "" : "s"}`}
      />
      <DocumentSearchClient documents={documents} />
    </main>
  );
}
