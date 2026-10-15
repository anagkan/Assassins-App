import { redirect } from "next/navigation";
import { inviteQuery, readInvite } from "@/lib/invite";
import { getCurrentUser } from "@/lib/session";

/** Share link for a game's join code: prefills it on the dashboard, via login if needed. */
export default async function JoinLink({ params }: { params: Promise<{ code: string }> }) {
  const q = inviteQuery(readInvite({ join: (await params).code }));
  redirect((await getCurrentUser()) ? `/${q}` : `/login${q}`);
}
