import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { getRolePermissions } from "@/lib/airtable";
import { ADMIN_PAGES, can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// The standalone admin "Overview" landing was removed in favour of the
// two-level category navigation (Network / HR, Clients, Projects,
// Finance, Legal). /admin now lands on the first page the current admin
// is allowed to view (so a partial-access admin never hits a 403).
export default async function AdminLandingPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  const stored = await getRolePermissions();
  const first = ADMIN_PAGES.find((p) => can(session.role, p.key, "view", stored));
  redirect(first ? first.href : "/dashboard");
}
