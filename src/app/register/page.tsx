import Link from "next/link";
import { redirect } from "next/navigation";
import { Flash } from "@/components/ui";
import { getDb } from "@/db";
import { getCurrentGame } from "@/lib/game";
import { getCurrentUser } from "@/lib/session";
import { registerAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; code?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  const game = getCurrentGame(getDb());
  const open = game?.status === "registration";
  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="h-display mb-1 text-4xl">Sign up</h1>
      <p className="mb-6 text-sm text-muted">
        {open ? <>Registration is open for <b className="text-bone">{game!.name}</b>.</> : "Sign-ups are closed right now."}
      </p>
      <Flash searchParams={sp} />
      {open && (
        <form action={registerAction} className="card space-y-4">
          <div>
            <label className="label" htmlFor="joinCode">Join code</label>
            <input className="input uppercase" id="joinCode" name="joinCode" defaultValue={sp.code} required autoCapitalize="characters" />
            <p className="mt-1 text-xs text-muted">Get this from the club officers.</p>
          </div>
          <div>
            <label className="label" htmlFor="displayName">Your name (as people know you)</label>
            <input className="input" id="displayName" name="displayName" required maxLength={60} />
          </div>
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input className="input" id="username" name="username" autoComplete="username" autoCapitalize="none" required pattern="[A-Za-z0-9_.\-]{3,32}" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <button className="btn btn-primary w-full" type="submit">Create account &amp; join</button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-muted">
        Played before? <Link href="/login" className="text-gold underline">Log in</Link> and join from your dashboard.
      </p>
    </div>
  );
}
