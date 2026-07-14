"use client";

import { useState } from "react";
import { PaymentsClient } from "./payments-client";
import { PaymentReviewClient, type MemberGroup, type ReviewBundle } from "../payment-review/review-client";
import { PaymentsByProject, PaymentsByMember } from "./payments-breakdown";
import type { Currency, PaymentRecord } from "@/lib/airtable";

type Tab = "payments" | "review" | "byproject" | "bymember";

type LinkOpt = { id: string; code: string; name: string };
type ClientOpt = { id: string; code: string; name: string; subjectToDes: "Yes" | "No" | "" };
type StaffingOpt = {
  id: string;
  staffingCode: string;
  projectCode: string;
  projectName: string;
  memberRecordId: string;
  memberCode: string;
};
type MemberInvoiceOpt = {
  id: string;
  invoiceCode: string;
  memberRecordId: string;
  memberCode: string;
  memberName: string;
  projectCode: string;
  projectName: string;
  staffingCode: string;
  amount: number | null;
  currency: string;
  status: string;
  submissionDate: string | null;
  pdfUrl: string;
};

// Finance → Payments hub: the payments list and the per-member payment review
// under one segmented control, mirroring the Invoices hub.
export function PaymentsTabsClient({
  payments,
  projects,
  clients,
  members,
  staffings,
  memberInvoices,
  currencies,
  linkedPaymentIds,
  initialSearch,
  initialPaymentId,
  reviewGroups,
  bundleById,
  totalUnderReview,
}: {
  payments: PaymentRecord[];
  projects: LinkOpt[];
  clients: ClientOpt[];
  members: LinkOpt[];
  staffings: StaffingOpt[];
  memberInvoices: MemberInvoiceOpt[];
  currencies: readonly Currency[];
  linkedPaymentIds: string[];
  initialSearch: string;
  initialPaymentId?: string;
  reviewGroups: MemberGroup[];
  bundleById: Record<string, ReviewBundle>;
  totalUnderReview: number;
}) {
  // Landing via a payment search link should open the list, not review.
  const [tab, setTab] = useState<Tab>("payments");
  // When a By project / By member row links to Review, switch tab + preselect.
  const [reviewMemberId, setReviewMemberId] = useState<string | undefined>(undefined);
  function openReview(memberId?: string) {
    setReviewMemberId(memberId);
    setTab("review");
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Payments view"
        className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5"
      >
        <TabButton active={tab === "review"} onClick={() => setTab("review")}>
          Review
          {totalUnderReview > 0 ? (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
              {totalUnderReview}
            </span>
          ) : null}
        </TabButton>
        <TabButton active={tab === "payments"} onClick={() => setTab("payments")}>
          Overview
          <span className="ml-1.5 text-[10px] text-slate-400">{payments.length}</span>
        </TabButton>
        <TabButton active={tab === "byproject"} onClick={() => setTab("byproject")}>
          By project
        </TabButton>
        <TabButton active={tab === "bymember"} onClick={() => setTab("bymember")}>
          By member
        </TabButton>
      </div>

      {tab === "payments" ? (
        <PaymentsClient
          payments={payments}
          projects={projects}
          clients={clients}
          members={members}
          staffings={staffings}
          memberInvoices={memberInvoices}
          currencies={currencies}
          linkedPaymentIds={linkedPaymentIds}
          initialSearch={initialSearch}
          initialPaymentId={initialPaymentId}
          bundleById={bundleById}
        />
      ) : tab === "review" ? (
        <PaymentReviewClient groups={reviewGroups} initialMemberId={reviewMemberId} />
      ) : tab === "byproject" ? (
        <PaymentsByProject
          payments={payments}
          projects={projects}
          clients={clients}
          members={members}
          bundleById={bundleById}
          onOpenReview={openReview}
        />
      ) : (
        <PaymentsByMember
          payments={payments}
          members={members}
          projects={projects}
          bundleById={bundleById}
          onOpenReview={openReview}
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
