import { redirect } from "next/navigation";

// Automated (vendor) invoices now live under Finance → Invoices, alongside
// member invoices. Keep this path working for old links/bookmarks.
export default function AdminVendorInvoicesPage() {
  redirect("/admin/invoices");
}
