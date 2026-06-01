import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  listConversationsFor,
  listMyProjects,
  listSignInActivity,
} from "@/lib/airtable";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Initial payload: the caller's conversations + the network roster (for the
  // "new chat" picker and for presence dots on avatars) + the caller's
  // projects + their teams (so the "Project chat" tab can pre-fill the
  // member list without another round-trip).
  const [conversations, members, myProjects] = await Promise.all([
    listConversationsFor(session.sub, session.memberCode),
    listSignInActivity(),
    listMyProjects(session.sub, session.memberCode),
  ]);

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-5">
      <ChatClient
        currentMemberId={session.sub}
        initialConversations={conversations}
        members={members.map((m) => ({
          id: m.id,
          code: m.memberCode,
          name: m.fullName || m.memberCode,
          photoUrl: m.photoUrl,
          lastActivity: m.lastActivity,
          status: m.status,
        }))}
        projects={myProjects.map((p) => ({
          code: p.projectCode,
          name: p.projectName,
          status: p.status,
          memberIds: p.team.map((t) => t.memberRecordId),
          memberNames: p.team.map((t) => t.fullName || t.memberCode),
        }))}
      />
    </main>
  );
}
