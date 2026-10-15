import Link from "next/link";
import { eq } from "drizzle-orm";
import { ConfirmButton, TypedConfirm } from "@/components/confirm";
import { ShareCode } from "@/components/ShareCode";
import { getDb } from "@/db";
import { teams } from "@/db/schema";
import { DEFAULT_RULES, DEFAULT_SAFE_ZONES } from "@/lib/defaults";
import { checkRing, startChecklist } from "@/lib/game";
import { gameStats } from "@/lib/queries";
import { gameStatusAction, updateSettingsAction } from "../../actions";
import { GameHeader, gameMetadata, loadGame } from "../../GameHeader";

export const generateMetadata = gameMetadata("Overview");

export default async function GameOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = loadGame(id);
  const db = getDb();
  const s = gameStats(db, game.id);
  const problems = checkRing(db, game.id);
  const checklist = game.status === "registration" ? startChecklist(db, game.id) : [];
  const blocked = checklist.some((c) => c.blocking && !c.ok);
  const liveTeams = db.select().from(teams).where(eq(teams.gameId, game.id)).all().filter((t) => t.status === "alive");
  const teamsLocked = game.status === "active" || game.status === "paused" || game.status === "finished";
  const mode = game.maxTeamSize === 1 ? "solo" : "teams";

  return (
    <>
      <GameHeader id={id} current={`/admin/games/${game.id}`} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card space-y-3 md:col-span-1">
          <h2 className="h-display text-xl">Status</h2>
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-ink-dim">Players</dt><dd>{s.alivePlayers}/{s.players} alive</dd>
            <dt className="text-ink-dim">Teams</dt><dd>{s.aliveTeams}/{s.teams} alive</dd>
            <dt className="text-ink-dim">Mode</dt>
            <dd>{game.maxTeamSize === 1 ? "Solo" : `Teams (${game.minTeamSize}–${game.maxTeamSize ?? "∞"})`}</dd>
          </dl>
          {problems.length > 0 && (
            <div className="rounded-sm bg-stop p-2 text-xs text-stop-ink">Ring problem: {problems.join(" ")}</div>
          )}

          {(game.status === "draft" || game.status === "registration") && (
            <div className="rounded-md border border-line p-3">
              <div className="label">Join code</div>
              <div className="font-mono text-2xl tracking-[0.3em] text-accent">{game.joinCode}</div>
              <p className="mt-1 text-xs text-ink-dim">
                Players enter this on their dashboard to join this game. Share it with the club, or share the link: it fills the code in for them (<span className="font-mono">/join/{game.joinCode}</span>).
              </p>
              <form action={gameStatusAction} className="mt-2 flex flex-wrap gap-2">
                <ShareCode path={`/join/${game.joinCode}`} title={`Join ${game.name}`} />
                <input type="hidden" name="gameId" value={game.id} />
                <ConfirmButton name="op" value="joincode" className="btn btn-sm" message="Generate a new join code? The current one stops working, including anywhere it's already been shared.">Regenerate</ConfirmButton>
              </form>
            </div>
          )}

          <form action={gameStatusAction} className="space-y-2">
            <input type="hidden" name="gameId" value={game.id} />
            {game.status === "draft" && <button name="op" value="open" className="btn btn-primary w-full">Open registration</button>}
            {game.status === "registration" && (
              <>
                <div className="flex items-center justify-between gap-2 rounded-md border border-line p-2 text-sm">
                  <span>Sign-ups: <b className={game.signupsOpen ? "text-ok-ink" : "text-stop-ink"}>{game.signupsOpen ? "Open" : "Closed"}</b></span>
                  {game.signupsOpen ? (
                    <button name="op" value="closesignups" className="btn btn-sm">Close sign-ups</button>
                  ) : (
                    <button name="op" value="opensignups" className="btn btn-sm">Reopen sign-ups</button>
                  )}
                </div>
                <div className="rounded-md border border-line p-2">
                  <div className="label">Ready to start?</div>
                  <ul className="space-y-1 text-sm">
                    {checklist.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden className={c.ok ? "text-ok-ink" : c.blocking ? "text-stop-ink" : "text-warn-ink"}>{c.ok ? "✓" : c.blocking ? "✗" : "!"}</span>
                        <span className={c.ok ? "text-ink-dim" : ""}>{c.text}</span>
                      </li>
                    ))}
                  </ul>
                  {blocked && (
                    <p className="mt-2 text-xs text-ink-dim">
                      Fix the ✗ items on <Link href={`/admin/games/${game.id}/teams`} className="underline">Teams &amp; players</Link> first. Items marked ! won&apos;t stop the start.
                    </p>
                  )}
                </div>
                <button name="op" value="start" className="btn btn-primary w-full" disabled={blocked}>Start game &amp; assign targets</button>
              </>
            )}
            {game.status === "active" && <button name="op" value="pause" className="btn w-full">Pause game</button>}
            {game.status === "paused" && <button name="op" value="resume" className="btn btn-primary w-full">Resume game</button>}
          </form>

          {(game.status === "registration" || game.status === "active" || game.status === "paused") && (
            <form action={gameStatusAction} className="space-y-2 border-t border-line pt-3">
              <input type="hidden" name="gameId" value={game.id} />
              <label className="label" htmlFor="winnerTeamId">End game early. Winner:</label>
              <select className="input" id="winnerTeamId" name="winnerTeamId" defaultValue="">
                <option value="">No winner</option>
                {liveTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.kills} kills)</option>
                ))}
              </select>
              <input type="hidden" name="op" value="finish" />
              <p className="text-xs text-ink-dim">Ends the game for everyone and voids pending kill reports. This can&apos;t be undone.</p>
              <TypedConfirm expected={game.name} label="Finish game" className="btn btn-danger w-full" />
            </form>
          )}
        </div>

        <form action={updateSettingsAction} className="card space-y-4 md:col-span-2">
          <h2 className="h-display text-xl">Settings</h2>
          <input type="hidden" name="gameId" value={game.id} />
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input className="input" id="name" name="name" defaultValue={game.name} required />
          </div>

          <fieldset disabled={teamsLocked} className="space-y-3 rounded-md border border-line p-3 disabled:opacity-60">
            <legend className="label px-1">Teams {teamsLocked && "(locked once started)"}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="teamMode" value="solo" defaultChecked={mode === "solo"} /> Solo (everyone for themselves)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="teamMode" value="teams" defaultChecked={mode === "teams"} /> Teams
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="minTeamSize">Min team size</label>
                <input className="input" id="minTeamSize" name="minTeamSize" type="number" min={1} defaultValue={game.minTeamSize} />
              </div>
              <div>
                <label className="label" htmlFor="maxTeamSize">Max team size (blank = any)</label>
                <input className="input" id="maxTeamSize" name="maxTeamSize" type="number" min={1} defaultValue={game.maxTeamSize ?? ""} />
              </div>
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="inactivityDays">Inactivity limit, days (blank = off)</label>
              <input className="input" id="inactivityDays" name="inactivityDays" type="number" min={1} defaultValue={game.inactivityDays ?? ""} />
            </div>
            <label className="flex items-center gap-2 pt-5 text-sm">
              <input type="checkbox" name="showKillerInFeed" value="1" defaultChecked={game.showKillerInFeed} /> Show who made each kill in the public feed
            </label>
          </div>
          <div>
            <label className="label" htmlFor="rulesMarkdown">Rules (Markdown)</label>
            {!game.rulesMarkdown && <Unpublished />}
            <textarea className="input font-mono text-sm" id="rulesMarkdown" name="rulesMarkdown" rows={12} defaultValue={game.rulesMarkdown || DEFAULT_RULES} />
          </div>
          <div>
            <label className="label" htmlFor="safeZonesMarkdown">Safe zones (Markdown)</label>
            {!game.safeZonesMarkdown && <Unpublished />}
            <textarea className="input font-mono text-sm" id="safeZonesMarkdown" name="safeZonesMarkdown" rows={5} defaultValue={game.safeZonesMarkdown || DEFAULT_SAFE_ZONES} />
          </div>
          <button className="btn btn-primary">Save settings</button>
        </form>
      </div>
    </>
  );
}

/** Shown when the box holds the built-in template rather than anything saved. */
function Unpublished() {
  return <p className="mb-1 text-xs text-warn-ink">Template, not published. Players won&apos;t see this until you save.</p>;
}
