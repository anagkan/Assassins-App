import { redirect } from "next/navigation";
import { inviteQuery, readInvite } from "@/lib/invite";
import { getCurrentUser } from "@/lib/session";

/** Share link for a team's invite code: prefills it on the dashboard, via login if needed. */
export default async function TeamLink({ params }: { params: Promise<{ code: string }> }) {
  const q = inviteQuery(readInvite({ team: (await params).code }));
  redirect((await getCurrentUser()) ? `/${q}` : `/login${q}`);
}
