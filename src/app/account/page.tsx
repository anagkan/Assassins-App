import { Avatar, Flash, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { changePasswordAction, updateProfileAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <PageTitle sub={`Signed in as @${user.username}`}>Profile</PageTitle>
      <Flash searchParams={sp} />
      <div className="grid gap-4 md:grid-cols-2">
        <form action={updateProfileAction} className="card space-y-4">
          <h2 className="h-display text-xl">Name</h2>
          <Avatar name={user.displayName} size={72} />
          <div>
            <label className="label" htmlFor="displayName">Name</label>
            <input className="input" id="displayName" name="displayName" defaultValue={user.displayName} maxLength={60} required />
          </div>
          <button className="btn btn-primary">Save profile</button>
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
      </div>
    </>
  );
}
