import { Empty, PageTitle, fmtDate } from "@/components/ui";
import { getDb } from "@/db";
import { feed, gameStats } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { resolveGame } from "@/lib/viewGame";

export const dynamic = "force-dynamic";

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  await requireUser();
  const game = resolveGame((await searchParams).game);
  if (!game) return <PageTitle>No games yet</PageTitle>;
  const db = getDb();
  const events = feed(db, game.id);
  const stats = gameStats(db, game.id);
  const showKiller = game.showKillerInFeed;

  return (
    <>
      <PageTitle sub={`${stats.alivePlayers} of ${stats.players} players alive · ${stats.aliveTeams} of ${stats.teams} teams standing`}>
        Kill feed · {game.name}
      </PageTitle>
      {events.length === 0 ? (
        <Empty>No blood spilled yet.</Empty>
      ) : (
        <ol className="space-y-2">
          {events.map((e, i) => (
            <li key={i} className="card flex items-start gap-3 py-3">
              <span className="mt-0.5 text-lg" aria-hidden>
                {e.kind === "kill" ? "🗡" : e.kind === "team_out" ? "☠" : "🚫"}
              </span>
              <div className="flex-1">
                {e.kind === "kill" && (
                  <p>
                    <b>{e.victim}</b>
                    {!e.solo && <span className="text-muted"> ({e.victimTeam})</span>} was eliminated
                    {showKiller && (
                      <>
                        {" "}by <b>{e.killer}</b>
                        {e.killerTeam !== e.killer && <span className="text-muted"> ({e.killerTeam})</span>}
                      </>
                    )}
                    .
                  </p>
                )}
                {e.kind === "team_out" && (
                  <p className="text-blood">
                    Team <b>{e.team}</b> {e.purged ? "has been removed from the game" : "has been wiped out"}
                    {showKiller && e.by && !e.purged && <> by <b>{e.by}</b></>}.
                  </p>
                )}
                {e.kind === "player_removed" && (
                  <p className="text-muted">
                    <b>{e.player}</b> was removed from the game.
                  </p>
                )}
                <p className="text-xs text-muted">{fmtDate(e.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
