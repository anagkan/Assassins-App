import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TypedConfirm } from "@/components/confirm";
import { Flash } from "@/components/Flash";
import { PageTitle, StatusPill, fmtDate } from "@/components/ui";
import { getDb } from "@/db";
import { games, participants, users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { AdminNav } from "../../AdminNav";
import { deleteUserAction, updateUserAction } from "../../actions";

export const metadata: Metadata = { title: "Edit user" };

export default async function UserAdmin({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, Number((await params).id))).get();
  if (!user) notFound();
  const played = db
    .select({ game: games, status: participants.status })
    .from(participants)
    .innerJoin(games, eq(games.id, participants.gameId))
    .where(eq(participants.userId, user.id))
    .orderBy(desc(games.id))
    .all();
  // Accounts created before sign-up collected names only have a display name.
  const [first, ...rest] = user.displayName.split(" ");
  const aliveInRunning = played.find((r) => (r.game.status === "active" || r.game.status === "paused") && r.status === "alive");
  const hasHistory = played.some((r) => r.game.status !== "registration");

  return (
    <>
      <PageTitle sub={<>@{user.username} · joined {fmtDate(user.createdAt)}{user.isAdmin && " · admin"}</>}>{user.displayName}</PageTitle>
      <AdminNav current="/admin/users" />
      <Flash />
      <Link href="/admin/users" className="mb-4 inline-block text-sm text-ink-dim hover:text-ink">← All users</Link>
      <div className="grid gap-4 md:grid-cols-2">
        <form action={updateUserAction} className="card space-y-4">
          <input type="hidden" name="userId" value={user.id} />
          <h2 className="h-display text-xl">Account details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="firstName">First name</label>
              <input className="input" id="firstName" name="firstName" defaultValue={user.firstName ?? first} maxLength={40} required />
            </div>
            <div>
              <label className="label" htmlFor="lastName">Last name</label>
              <input className="input" id="lastName" name="lastName" defaultValue={user.lastName ?? rest.join(" ")} maxLength={40} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input className="input" id="username" name="username" defaultValue={user.username} autoCapitalize="none" required pattern="[A-Za-z0-9_.\-]{3,32}" title="3–32 letters, numbers, dot, dash or underscore" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="netId">NetID</label>
              <input className="input" id="netId" name="netId" defaultValue={user.netId ?? ""} autoCapitalize="none" pattern="[A-Za-z]{2}[0-9]{4}" maxLength={6} title="2 letters followed by 4 numbers" />
            </div>
            <div>
              <label className="label" htmlFor="puid">PUID</label>
              <input className="input font-mono" id="puid" name="puid" defaultValue={user.puid ?? ""} inputMode="numeric" pattern="[0-9]{9}" maxLength={9} title="9 digits" />
            </div>
          </div>
          <p className="text-xs text-ink-dim">NetID and PUID can be left blank for accounts that aren&apos;t a student&apos;s.</p>
          <button className="btn btn-primary">Save account</button>
        </form>

        <div className="space-y-4">
          <div className="card space-y-2">
            <h2 className="h-display text-xl">Games</h2>
            {played.length === 0 ? (
              <p className="text-sm text-ink-dim">Hasn&apos;t joined any games.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {played.map((r) => (
                  <li key={r.game.id} className="flex items-center justify-between gap-2">
                    <Link href={`/admin/games/${r.game.id}/teams`} className="hover:underline">{r.game.name}</Link>
                    <span className="flex gap-1">
                      <StatusPill status={r.game.status} />
                      {r.game.status !== "registration" && <StatusPill status={r.status} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {user.id !== me.id && (
            <form action={deleteUserAction} className="card space-y-3 border-stop-ink">
              <input type="hidden" name="userId" value={user.id} />
              <h2 className="h-display text-xl">Delete account</h2>
              {aliveInRunning ? (
                <p className="text-sm">
                  They&apos;re still alive in <b>{aliveInRunning.game.name}</b>. Remove them from that game on its{" "}
                  <Link href={`/admin/games/${aliveInRunning.game.id}/teams`} className="underline">Teams page</Link> before deleting the account.
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-dim">
                    {hasHistory
                      ? "They've played in a game, so their name, NetID and PUID are wiped and they show as \"Deleted player\" in past games. They can't log in again."
                      : "The account is removed for good, along with any game sign-ups that haven't started yet."}
                  </p>
                  <TypedConfirm expected={user.username} label="Delete account" className="btn btn-danger w-full" />
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </>
  );
}
