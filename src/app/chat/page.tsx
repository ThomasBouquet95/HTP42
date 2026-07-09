import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getConversation,
  listConversationsFor,
  listMessages,
  listMyProjects,
  listSignInActivity,
} from "@/lib/airtable";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Initial payload: the caller's conversations + the network roster (for the
  // "new chat" picker and for presence dots on avatars) + the caller's
  // projects + their teams (so the "Project chat" tab can pre-fill the
  // member list without another round-trip).
  const sp = await searchParams;
  const activeId = sp.c?.trim() || null;

  const [conversations, members, myProjects] = await Promise.all([
    listConversationsFor(session.sub, session.memberCode),
    listSignInActivity(),
    listMyProjects(session.sub, session.memberCode),
  ]);

  // Preload the active conversation's messages server-side so the first
  // paint already shows the thread. Skipped (or zeroed out) if the URL
  // doesn't point at a valid conversation the caller is in.
  let initialActiveId: string | null = null;
  let initialMessages: Awaited<ReturnType<typeof listMessages>> = [];
  if (activeId) {
    const conv = await getConversation(activeId);
    if (conv && conv.memberRecordIds.includes(session.sub)) {
      initialActiveId = activeId;
      initialMessages = await listMessages(activeId);
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <ChatClient
        currentMemberId={session.sub}
        initialConversations={conversations}
        initialActiveId={initialActiveId}
        initialMessages={initialMessages}
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
