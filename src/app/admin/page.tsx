import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The standalone admin "Overview" landing was removed in favour of the
// two-level category navigation (Network / HR, Clients, Projects,
// Finance, Legal). /admin now lands on the first category's first page.
export default async function AdminLandingPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  redirect("/admin/members");
}
