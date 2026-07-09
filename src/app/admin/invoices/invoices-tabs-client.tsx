"use client";

import { useState } from "react";
import { AdminInvoicesClient } from "./invoices-client";
import { VendorInvoicesClient } from "../vendor-invoices/vendor-invoices-client";
import type { MemberInvoiceRecord, VendorInvoiceRecord } from "@/lib/airtable";

type Tab = "member" | "automated";

// The Finance → Invoices hub. One place for every invoice the firm handles:
// member-submitted invoices (from the network) and automated vendor invoices
// (imported from the billing mailbox). A segmented control switches between
// the two; each keeps its own full table + actions.
export function InvoicesTabsClient({
  memberInvoices,
  paymentByInvoiceId,
  vendorInvoices,
  paymentCodeById,
  mailbox,
  projectCode,
}: {
  memberInvoices: MemberInvoiceRecord[];
  paymentByInvoiceId: Record<string, { id: string; code: string }>;
  vendorInvoices: VendorInvoiceRecord[];
  paymentCodeById: Record<string, string>;
  mailbox: string;
  projectCode: string;
}) {
  const [tab, setTab] = useState<Tab>("member");
  const needsReview = vendorInvoices.filter((i) => i.status === "Needs Review").length;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Invoice type"
        className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5"
      >
        <TabButton active={tab === "member"} onClick={() => setTab("member")}>
          Member invoices
          <Count>{memberInvoices.length}</Count>
        </TabButton>
        <TabButton active={tab === "automated"} onClick={() => setTab("automated")}>
          Automated invoices
          {needsReview > 0 ? (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
              {needsReview}
            </span>
          ) : (
            <Count>{vendorInvoices.length}</Count>
          )}
        </TabButton>
      </div>

      {tab === "member" ? (
        <AdminInvoicesClient
          invoices={memberInvoices}
          paymentByInvoiceId={paymentByInvoiceId}
        />
      ) : (
        <VendorInvoicesClient
          invoices={vendorInvoices}
          paymentCodeById={paymentCodeById}
          mailbox={mailbox}
          projectCode={projectCode}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="ml-1.5 text-[10px] text-slate-400">{children}</span>;
}
