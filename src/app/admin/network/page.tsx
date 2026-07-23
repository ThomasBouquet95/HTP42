import { redirect } from "next/navigation";

// The Network cockpit has been consolidated into the Members view
// (/admin/members), which now carries the interactive roster, staffing,
// billed KPIs, client ratings and internal notes. Keep this route as a
// redirect so old links / bookmarks still land somewhere sensible.
export default function AdminNetworkCockpitPage() {
  redirect("/admin/members");
}
