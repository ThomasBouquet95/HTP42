import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { listPayments } from "@/lib/airtable";
import { PaymentsClient } from "./payments-client";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const payments = await listPayments();

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Payments</h1>
            <p className="text-sm text-slate-600 mt-1">
              {payments.length} payment{payments.length === 1 ? "" : "s"} · finance dashboard
            </p>
          </div>
          <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700 self-center">
            ← Back to admin
          </Link>
        </div>
        <PaymentsClient payments={payments} />
      </main>
    </>
  );
}
