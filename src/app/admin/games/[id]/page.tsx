import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { teams } from "@/db/schema";
import { checkRing } from "@/lib/game";
import { gameStats } from "@/lib/queries";
import { gameStatusAction, updateSettingsAction } from "../../actions";
import { GameHeader, loadGame } from "../../GameHeader";

const DEFAULT_RULES = `## How to play
- Everyone is secretly assigned a target. Eliminate your target by **tapping them on the torso with a spoon**.
- When you eliminate your target, report it in the app. Once an admin approves it, you inherit their target.
- In team games, any member of your team may eliminate any member of your target team. A team is out when all its members are out.
- Last one (or team) standing wins.

## Fair play
- Your spoon must be visible and carried at all times when outside a safe zone.
- No throwing spoons. No physical force, no tackling, no entering someone's room uninvited.
- Kills with no witnesses are fine, but be honest. The admins can reverse any kill.
- If you're eliminated, tell your killer your status promptly.`;

const DEFAULT_SAFE_ZONES = `- Inside the Colonial dining room during meals
- Classrooms, labs, libraries and exams
- Bedrooms and bathrooms
- Varsity practices and games, religious services, work shifts`;

export default async function GameOverview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const game = loadGame(id);
  const db = getDb();
  const s = gameStats(db, game.id);
  const problems = checkRing(db, game.id);
  const liveTeams = db.select().from(teams).where(eq(teams.gameId, game.id)).all().filter((t) => t.status === "alive");
  const teamsLocked = game.status === "active" || game.status === "paused" || game.status === "finished";
  const mode = game.maxTeamSize === 1 ? "solo" : "teams";

  return (
    <>
      <GameHeader id={id} current={`/admin/games/${game.id}`} sp={sp} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card space-y-3 md:col-span-1">
          <h2 className="h-display text-xl">Status</h2>
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-muted">Players</dt><dd>{s.alivePlayers}/{s.players} alive</dd>
            <dt className="text-muted">Teams</dt><dd>{s.aliveTeams}/{s.teams} alive</dd>
            <dt className="text-muted">Mode</dt>
            <dd>{game.maxTeamSize === 1 ? "Solo" : `Teams (${game.minTeamSize}–${game.maxTeamSize ?? "∞"})`}</dd>
          </dl>
          {problems.length > 0 && (
            <div className="rounded-lg border border-blood p-2 text-xs text-blood">Ring problem: {problems.join(" ")}</div>
          )}

          {(game.status === "draft" || game.status === "registration") && (
            <div className="rounded-lg border border-line p-3">
              <div className="label">Join code</div>
              <div className="font-mono text-2xl tracking-[0.3em] text-gold">{game.joinCode}</div>
              <p className="mt-1 text-xs text-muted">Players need this to sign up. Share it with the club.</p>
              <form action={gameStatusAction} className="mt-2">
                <input type="hidden" name="gameId" value={game.id} />
                <button name="op" value="joincode" className="btn btn-sm">Regenerate</button>
              </form>
            </div>
          )}

          <form action={gameStatusAction} className="space-y-2">
            <input type="hidden" name="gameId" value={game.id} />
            {game.status === "draft" && <button name="op" value="open" className="btn btn-primary w-full">Open registration</button>}
            {game.status === "registration" && (
              <>
                <button name="op" value="start" className="btn btn-primary w-full">Start game &amp; assign targets</button>
                <p className="text-xs text-muted">Every player must be on a team first (see Teams &amp; players → auto-fill).</p>
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
              <button name="op" value="finish" className="btn btn-danger w-full">Finish game</button>
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

          <fieldset disabled={teamsLocked} className="space-y-3 rounded-lg border border-line p-3 disabled:opacity-60">
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
            <textarea className="input font-mono text-sm" id="rulesMarkdown" name="rulesMarkdown" rows={12} defaultValue={game.rulesMarkdown || DEFAULT_RULES} />
          </div>
          <div>
            <label className="label" htmlFor="safeZonesMarkdown">Safe zones (Markdown)</label>
            <textarea className="input font-mono text-sm" id="safeZonesMarkdown" name="safeZonesMarkdown" rows={5} defaultValue={game.safeZonesMarkdown || DEFAULT_SAFE_ZONES} />
          </div>
          <button className="btn btn-primary">Save settings</button>
        </form>
      </div>
    </>
  );
}
