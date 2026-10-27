import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { inviteQuery, readInvite } from "@/lib/invite";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ join?: string; team?: string }> }) {
  const sp = await searchParams;
  const invite = readInvite(sp);
  if (await getCurrentUser()) redirect(`/${inviteQuery(invite)}`);
  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="h-display mb-1 text-4xl">Log in</h1>
      <p className="mb-6 text-sm text-ink-dim">
        {invite.join || invite.team ? `Log in to use your ${invite.join ? "join" : "team invite"} link.` : "Trust no one."}
      </p>
      <Flash />
      <LoginForm invite={invite} />
      <p className="mt-4 text-center text-sm text-ink-dim">
        New this semester? <Link href={`/register${inviteQuery(invite)}`} className="text-accent underline">Create an account</Link>
        <br />
        Forgot your password? Ask a game admin to reset it.
      </p>
    </div>
  );
}
