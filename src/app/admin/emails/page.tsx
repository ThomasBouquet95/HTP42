import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { getEmailTemplateOverrides } from "@/lib/airtable";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import { EmailsClient } from "./emails-client";

export const dynamic = "force-dynamic";

// Emails template manager. Governed by the "emails" page permission — the
// locked-full roles see it by default; other admin roles only if granted.
export default async function AdminEmailsPage() {
  const access = await requireAdminPage("emails");
  if (!access) redirect("/admin");
  const { canEdit } = access;

  const overrides = await getEmailTemplateOverrides();
  const templates = EMAIL_TEMPLATES.map((t) => ({
    def: t,
    override: overrides[t.key] ?? null,
  }));

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="emails" />
      <PageHeader
        title="Emails"
        subtitle="· every automated email the portal sends, with editable subject and body"
      />
      <EmailsClient templates={templates} canEdit={canEdit} />
    </main>
  );
}
