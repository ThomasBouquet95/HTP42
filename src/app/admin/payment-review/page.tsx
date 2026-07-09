import { redirect } from "next/navigation";

// Payment review now lives under Finance → Payments, alongside the payments
// list. Keep this path working for old links/bookmarks.
export default function PaymentReviewPage() {
  redirect("/admin/payments");
}
