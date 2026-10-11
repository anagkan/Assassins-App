import { Empty, fmtDate, fmtRelative } from "@/components/ui";
import { getDb } from "@/db";
import { checkRing, getInactiveTeams } from "@/lib/game";
import { ringView } from "@/lib/queries";
import { purgeInactiveAction, reshuffleAction } from "../../../actions";
import { GameHeader, loadGame } from "../../../GameHeader";

export default async function RingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const game = loadGame(id);
  const db = getDb();
  const live = game.status === "active" || game.status === "paused";
  const ring = ringView(db, game.id);
  const problems = checkRing(db, game.id);
  const inactive = getInactiveTeams(db, game.id);

  return (
    <>
      <GameHeader id={id} current={`/admin/games/${game.id}/ring`} sp={sp} />
      <p className="mb-4 text-sm text-muted">⚠ This page shows every assignment. Don&apos;t screen-share it.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="h-display flex-1 text-xl">Target ring</h2>
            {live && (problems.length ? <span className="pill border-blood text-blood">invalid</span> : <span className="pill border-ok text-ok">valid</span>)}
          </div>
          {problems.length > 0 && <p className="mb-3 text-sm text-blood">{problems.join(" ")}</p>}
          {!live || ring.length === 0 ? (
            <Empty>The ring exists only while a game is running.</Empty>
          ) : (
            <ol className="space-y-1 text-sm">
              {ring.map(({ team, alive }, i) => (
                <li key={team.id} className="flex items-start gap-2">
                  <span className="w-6 text-right text-muted">{i + 1}.</span>
                  <div className="flex-1">
                    <b>{team.name}</b> <span className="text-muted">({alive.map((m) => m.displayName).join(", ")})</span>
                    <div className="text-xs text-blood">↓ hunts</div>
                  </div>
                </li>
              ))}
              <li className="pl-8 text-xs text-muted">…back to {ring[0].team.name}</li>
            </ol>
          )}
          {live && ring.length > 1 && (
            <form action={reshuffleAction} className="mt-4 border-t border-line pt-3">
              <input type="hidden" name="gameId" value={game.id} />
              <button className="btn btn-sm">Reshuffle all targets</button>
              <p className="mt-1 text-xs text-muted">Gives every alive team a new random target, voids pending reports and restarts inactivity clocks.</p>
            </form>
          )}
        </div>

        <div className="card self-start">
          <h2 className="h-display mb-3 text-xl">Inactivity</h2>
          {game.inactivityDays == null ? (
            <Empty>No inactivity limit set (see Overview → Settings).</Empty>
          ) : !live ? (
            <Empty>Only applies while the game is running.</Empty>
          ) : inactive.length === 0 ? (
            <Empty>No team has gone {game.inactivityDays} day{game.inactivityDays === 1 ? "" : "s"} without a kill.</Empty>
          ) : (
            <form action={purgeInactiveAction} className="space-y-2">
              <input type="hidden" name="gameId" value={game.id} />
              <p className="text-sm text-muted">These teams passed their deadline. Untick anyone you want to spare.</p>
              {inactive.map(({ team, deadline }) => (
                <label key={team.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="teamId" value={team.id} defaultChecked />
                  <span className="flex-1">{team.name}</span>
                  <span className="text-xs text-muted" title={fmtDate(deadline)}>overdue {fmtRelative(deadline).replace(" ago", "")}</span>
                </label>
              ))}
              <button className="btn btn-danger">Purge selected</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
