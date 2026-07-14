import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { DocsClient } from "./docs-client";

export const dynamic = "force-dynamic";

export default async function AdminDocsPage() {
  const access = await requireAdminPage("documentation");
  if (!access) redirect("/admin");

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="documentation" />
      <PageHeader title="Documentation" subtitle="· how the portal works, for administrators" />
      <DocsClient />
    </main>
  );
}
