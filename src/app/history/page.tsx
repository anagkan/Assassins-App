import type { Metadata } from "next";
import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { Empty, PageTitle, StatusPill, fmtDate } from "@/components/ui";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { gameStats, teamWithMembers } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  await requireUser();
  const db = getDb();
  const all = db.select().from(games).where(inArray(games.status, ["registration", "active", "paused", "finished"])).orderBy(desc(games.id)).all();
  return (
    <>
      <PageTitle sub="Every game the club has played.">Hall of fame</PageTitle>
      {all.length === 0 ? (
        <Empty>No games yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {all.map((g) => {
            const winner = g.winnerTeamId ? teamWithMembers(db, g.winnerTeamId) : null;
            const s = gameStats(db, g.id);
            return (
              <li key={g.id} className="card">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="h-display text-xl">{g.name}</h2>
                  <StatusPill status={g.status} />
                  <span className="text-xs text-ink-dim">
                    {s.players} players · {s.teams} teams · {fmtDate(g.startedAt)} – {fmtDate(g.endedAt)}
                  </span>
                </div>
                {winner && (
                  <p className="mt-1 text-accent">
                    Winner: {winner.team.name}
                    {winner.members.length > 1 && <span className="text-ink-dim"> ({winner.members.map((m) => m.displayName).join(", ")})</span>}
                  </p>
                )}
                <p className="mt-2 text-sm">
                  <Link className="text-accent underline" href={`/leaderboard?game=${g.id}`}>Standings</Link> ·{" "}
                  <Link className="text-accent underline" href={`/feed?game=${g.id}`}>Feed</Link> ·{" "}
                  <Link className="text-accent underline" href={`/rules?game=${g.id}`}>Rules</Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
