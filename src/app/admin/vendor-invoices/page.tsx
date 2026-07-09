import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { listVendorInvoices } from "@/lib/airtable";
import { env } from "@/lib/env";
import { VendorInvoicesClient } from "./vendor-invoices-client";

export const dynamic = "force-dynamic";

export default async function AdminVendorInvoicesPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const invoices = await listVendorInvoices();
  const needsReview = invoices.filter((i) => i.status === "Needs Review").length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="vendorinvoices" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">IT invoices</h1>
        <span className="text-xs text-slate-500">
          · {invoices.length} on file
          {needsReview > 0 ? ` · ${needsReview} to review` : ""}
        </span>
      </div>
      <VendorInvoicesClient
        invoices={invoices}
        mailbox={env.automatedInvoiceMailbox}
        projectCode={env.automatedInvoiceProjectCode}
      />
    </main>
  );
}
