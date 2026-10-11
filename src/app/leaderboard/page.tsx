import { Empty, PageTitle, StatusPill } from "@/components/ui";
import { getDb } from "@/db";
import { leaderboard } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { resolveGame } from "@/lib/viewGame";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  await requireUser();
  const game = resolveGame((await searchParams).game);
  if (!game) return <PageTitle>No games yet</PageTitle>;
  const { teamRows, players } = leaderboard(getDb(), game.id);
  const solo = teamRows.every((t) => t.size <= 1);
  const topPlayers = players.filter((p) => p.kills > 0);

  return (
    <>
      <PageTitle>Standings · {game.name}</PageTitle>
      {teamRows.length === 0 ? (
        <Empty>No teams yet.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {!solo && (
            <div className="card">
              <h2 className="h-display mb-3 text-xl">Teams</h2>
              <table className="table">
                <thead>
                  <tr><th>Team</th><th>Alive</th><th>Kills</th><th /></tr>
                </thead>
                <tbody>
                  {teamRows.map(({ team, size, alive }) => (
                    <tr key={team.id} className={team.status !== "alive" ? "text-muted" : ""}>
                      <td>{game.winnerTeamId === team.id && "🏆 "}{team.name}</td>
                      <td>{alive}/{size}</td>
                      <td>{team.kills}</td>
                      <td>{team.status !== "alive" && <StatusPill status={team.status} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className={`card ${solo ? "md:col-span-2" : ""}`}>
            <h2 className="h-display mb-3 text-xl">{solo ? "Players" : "Top assassins"}</h2>
            {(solo ? players : topPlayers).length === 0 ? (
              <Empty>No kills yet.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Player</th>{!solo && <th>Team</th>}<th>Kills</th><th /></tr>
                </thead>
                <tbody>
                  {(solo ? players : topPlayers).map((p) => (
                    <tr key={p.participantId} className={p.status !== "alive" ? "text-muted" : ""}>
                      <td>{solo && game.winnerTeamId && p.status === "alive" && "🏆 "}{p.displayName}</td>
                      {!solo && <td>{p.teamName}</td>}
                      <td>{p.kills}</td>
                      <td>{p.status !== "alive" && <StatusPill status={p.status} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
