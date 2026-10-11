import Link from "next/link";
import { desc } from "drizzle-orm";
import { Flash, PageTitle, StatusPill, fmtDate } from "@/components/ui";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { gameStats, pendingReports } from "@/lib/queries";
import { createGameAction, deleteGameAction } from "./actions";

function suggestName() {
  const d = new Date();
  return `${d.getMonth() < 6 ? "Spring" : "Fall"} ${d.getFullYear()}`;
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const all = db.select().from(games).orderBy(desc(games.id)).all();
  return (
    <>
      <PageTitle sub="Run a new game each semester. Past games stay archived.">Admin</PageTitle>
      <Flash searchParams={sp} />
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/users" className="btn btn-sm">Users &amp; admins</Link>
        <Link href="/admin/audit" className="btn btn-sm">Audit log</Link>
      </div>

      <form action={createGameAction} className="card mb-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="name">New game name</label>
          <input className="input" id="name" name="name" defaultValue={suggestName()} required />
        </div>
        <div>
          <label className="label" htmlFor="copyFrom">Copy rules &amp; settings from</label>
          <select className="input" id="copyFrom" name="copyFrom" defaultValue={all[0]?.id ?? ""}>
            <option value="">Start fresh</option>
            {all.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary">Create game</button>
      </form>

      <ul className="space-y-2">
        {all.map((g) => {
          const s = gameStats(db, g.id);
          const pending = g.status === "active" || g.status === "paused" ? pendingReports(db, g.id).length : 0;
          return (
            <li key={g.id} className="card flex flex-wrap items-center gap-3 py-3">
              <Link href={`/admin/games/${g.id}`} className="h-display text-xl hover:text-gold">{g.name}</Link>
              <StatusPill status={g.status} />
              {pending > 0 && (
                <Link href={`/admin/games/${g.id}/kills`} className="pill border-gold text-gold">{pending} pending kill{pending === 1 ? "" : "s"}</Link>
              )}
              <span className="text-xs text-muted">
                {s.players} players · {s.teams} teams · created {fmtDate(g.createdAt)}
              </span>
              {g.status === "draft" && (
                <form action={deleteGameAction} className="ml-auto">
                  <input type="hidden" name="gameId" value={g.id} />
                  <button className="btn btn-danger btn-sm">Delete draft</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
