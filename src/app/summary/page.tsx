import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SummaryRedirect() {
  redirect("/timesheets/mine");
}
