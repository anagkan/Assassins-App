import { Avatar, Flash, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { changePasswordAction, updateProfileAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <PageTitle sub={`Signed in as @${user.username}`}>Account</PageTitle>
      <Flash searchParams={sp} />
      <div className="grid gap-4 md:grid-cols-2">
        <form action={updateProfileAction} className="card space-y-4">
          <h2 className="h-display text-xl">Profile</h2>
          <div className="flex items-center gap-4">
            <Avatar name={user.displayName} photo={user.photoPath} size={72} />
            <p className="text-xs text-muted">Your photo is shown to the players hunting you, so make it a clear one of your face.</p>
          </div>
          <div>
            <label className="label" htmlFor="displayName">Name</label>
            <input className="input" id="displayName" name="displayName" defaultValue={user.displayName} maxLength={60} required />
          </div>
          <div>
            <label className="label" htmlFor="photo">Photo (JPEG/PNG/WebP, ≤3 MB)</label>
            <input className="input" id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
          </div>
          {user.photoPath && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="removePhoto" value="1" /> Remove current photo
            </label>
          )}
          <button className="btn btn-primary">Save profile</button>
        </form>

        <form action={changePasswordAction} className={`card space-y-4 ${user.mustChangePassword ? "border-gold" : ""}`}>
          <h2 className="h-display text-xl">Change password</h2>
          {user.mustChangePassword && <p className="text-sm text-gold">You&apos;re using a temporary password. Please set your own.</p>}
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
