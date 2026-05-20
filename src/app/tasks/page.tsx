import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/session";
import {
  getStaffingsForMember,
  getTeammateMemberRecordIds,
  listAllMembers,
  listProjects,
  listTasksVisibleTo,
} from "@/lib/airtable";
import { TasksClient } from "./tasks-client";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const admin = isAdmin(session);

  const [tasks, myStaffings, members, allProjects, teammateIds] = await Promise.all([
    listTasksVisibleTo(session.sub, session.memberCode),
    getStaffingsForMember(session.memberCode),
    listAllMembers(),
    listProjects(),
    admin ? Promise.resolve(null) : getTeammateMemberRecordIds(session.memberCode),
  ]);

  // The Tasks form needs a Project record id (linked-record field) but
  // staffings only carry the project code as text. Build the picker from the
  // intersection of "my staffings' project codes" × "all projects".
  const myProjectCodes = new Set(myStaffings.map((s) => s.projectCode));
  const projects = allProjects
    .filter((p) => myProjectCodes.has(p.projectCode))
    .map((p) => ({
      id: p.id,
      code: p.projectCode,
      name: p.projectName,
    }));

  // Assignee picker scope: admins see the whole network; everyone else only
  // sees teammates (members they share at least one project with).
  const allowedMembers = admin
    ? members
    : members.filter((m) => teammateIds!.has(m.id));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-4">
        <h1 className="text-base sm:text-lg font-semibold">Tasks</h1>
      </div>
      <TasksClient
        tasks={tasks}
        projects={projects}
        members={allowedMembers.map((m) => ({
          id: m.id,
          code: m.memberCode,
          name: m.fullName,
          photoUrl: m.photo?.url ?? null,
        }))}
        currentMemberId={session.sub}
        isAdmin={admin}
      />
    </main>
  );
}
