import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Flash, PageTitle } from "@/components/ui";
import { getDb } from "@/db";
import { runningGameFor } from "@/lib/game";
import { requireUser } from "@/lib/session";
import { changePasswordAction, logoutAction, updateProfileAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Profile" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  // Accounts created before sign-up collected names only have a display name.
  const [first, ...rest] = user.displayName.split(" ");
  const firstName = user.firstName ?? first;
  const lastName = user.lastName ?? rest.join(" ");
  const running = runningGameFor(getDb(), user.id);
  return (
    <>
      <PageTitle sub={`Signed in as @${user.username}`}>Profile</PageTitle>
      <Flash searchParams={sp} />
      <div className="grid gap-4 md:grid-cols-2">
        <form action={updateProfileAction} className="card space-y-4">
          <h2 className="h-display text-xl">Name</h2>
          <Avatar name={user.displayName} size={72} />
          {running && (
            <p className="rounded-sm bg-warn px-3 py-2 text-sm text-(--warn-chip-ink)">
              Your name is locked while {running.name} is running. Ask an admin if it needs changing.
            </p>
          )}
          <fieldset disabled={!!running} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="firstName">First name</label>
              <input className="input" id="firstName" name="firstName" defaultValue={firstName} autoComplete="given-name" maxLength={40} required />
            </div>
            <div>
              <label className="label" htmlFor="lastName">Last name</label>
              <input className="input" id="lastName" name="lastName" defaultValue={lastName} autoComplete="family-name" maxLength={40} required />
            </div>
          </fieldset>
          {!running && <button className="btn btn-primary">Save profile</button>}
        </form>

        <form action={changePasswordAction} className={`card space-y-4 ${user.mustChangePassword ? "border-warn-ink" : ""}`}>
          <h2 className="h-display text-xl">Change password</h2>
          {user.mustChangePassword && <p className="rounded-sm bg-warn px-3 py-2 text-sm text-(--warn-chip-ink)">You&apos;re using a temporary password. Please set your own.</p>}
          <div>
            <label className="label" htmlFor="current">Current password</label>
            <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <div>
            <label className="label" htmlFor="password">New password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm new password</label>
            <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <button className="btn">Change password</button>
        </form>

        {/* Phones have no header links, so the rest of the menu lives here. */}
        <div className="card space-y-3 sm:hidden">
          <Link href="/history" className="btn w-full">Past games</Link>
          {user.isAdmin && <Link href="/admin" className="btn w-full">Admin console</Link>}
          <form action={logoutAction}>
            <button className="btn w-full" type="submit">Log out</button>
          </form>
        </div>
      </div>
    </>
  );
}
