import Link from "next/link";
import { Avatar, Flash, PageTitle, StatusPill, fmtDate, fmtRelative } from "@/components/ui";
import { getDb } from "@/db";
import type { Announcement, Game } from "@/db/schema";
import { getCurrentGame } from "@/lib/game";
import { activeAnnouncements, dashboard, gameStats, teamWithMembers, type Member } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import {
  createTeamAction,
  joinGameAction,
  joinTeamAction,
  leaveGameAction,
  leaveTeamAction,
  renameMyTeamAction,
  submitKillAction,
  withdrawKillAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SP = Promise<{ ok?: string; error?: string }>;

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = getDb();
  const game = getCurrentGame(db);

  if (!game) {
    return (
      <>
        <Flash searchParams={sp} />
        <PageTitle sub="Check back when the officers announce the next round.">No game right now</PageTitle>
        {user.isAdmin && (
          <Link href="/admin" className="btn btn-primary">Set up a game</Link>
        )}
      </>
    );
  }

  const data = dashboard(db, game, user.id);
  const stats = gameStats(db, game.id);
  const notices = activeAnnouncements(db, game.id);

  return (
    <>
      <Flash searchParams={sp} />
      <PageTitle
        sub={
          <>
            <StatusPill status={game.status} />{" "}
            {game.status === "registration"
              ? `${stats.players} signed up`
              : `${stats.alivePlayers}/${stats.players} players · ${stats.aliveTeams}/${stats.teams} teams alive`}
          </>
        }
      >
        {game.name}
      </PageTitle>

      {notices.length > 0 && <Notices items={notices} />}

      {!data.me ? (
        <JoinPanel game={game} />
      ) : game.status === "registration" ? (
        <RegistrationPanel game={game} teamId={data.me.teamId} />
      ) : game.status === "finished" ? (
        <FinishedPanel game={game} />
      ) : (
        <PlayingPanel game={game} data={data} />
      )}
    </>
  );
}

function Notices({ items }: { items: Announcement[] }) {
  return (
    <div className="mb-5 space-y-2">
      {items.map((a) => (
        <div
          key={a.id}
          className={`rounded-xl border px-4 py-3 ${a.kind === "immunity" ? "border-gold bg-gold/10" : a.kind === "rule" ? "border-blood bg-blood-dim/20" : "border-line bg-panel"}`}
        >
          <div className="text-xs font-bold uppercase tracking-wider text-muted">
            {a.kind === "immunity" ? "🛡 Immunity" : a.kind === "rule" ? "⚠ Rule" : "📣 Announcement"}
            {a.activeUntil && <span className="ml-2 font-normal normal-case">until {fmtDate(a.activeUntil)}</span>}
          </div>
          <div className="mt-0.5 font-semibold">{a.title}</div>
          {a.body && <p className="mt-1 whitespace-pre-line text-sm text-muted">{a.body}</p>}
        </div>
      ))}
    </div>
  );
}

function JoinPanel({ game }: { game: Game }) {
  if (game.status === "registration" && !game.signupsOpen) {
    return (
      <div className="card">
        <p>Sign-ups for {game.name} are closed right now. Ask the club officers if you think you should be in.</p>
      </div>
    );
  }
  if (game.status !== "registration") {
    return (
      <div className="card">
        <p>You aren&apos;t playing in this game. Follow along on the <Link href="/feed" className="text-gold underline">feed</Link>.</p>
      </div>
    );
  }
  return (
    <form action={joinGameAction} className="card max-w-md space-y-3">
      <h2 className="h-display text-xl">Join {game.name}</h2>
      <input type="hidden" name="gameId" value={game.id} />
      <div>
        <label className="label" htmlFor="joinCode">Join code</label>
        <input className="input uppercase" id="joinCode" name="joinCode" required />
      </div>
      <button className="btn btn-primary">Join game</button>
    </form>
  );
}

function teamLimitText(game: Game) {
  if (game.maxTeamSize === 1) return "This is a solo game: everyone plays on their own.";
  const max = game.maxTeamSize == null ? "any number of" : `up to ${game.maxTeamSize}`;
  return `Teams can have ${max} players${game.minTeamSize > 1 ? ` (minimum ${game.minTeamSize})` : ""}.`;
}

function RegistrationPanel({ game, teamId }: { game: Game; teamId: number | null }) {
  const db = getDb();
  const team = teamId != null ? teamWithMembers(db, teamId) : null;
  const solo = game.maxTeamSize === 1;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card md:col-span-2">
        <p className="text-sm">
          You&apos;re signed up. The game hasn&apos;t started yet; your target will appear here when it does.{" "}
          <span className="text-muted">{teamLimitText(game)}</span>
        </p>
      </div>

      {team ? (
        <div className="card space-y-4">
          <div>
            <div className="label">Your team</div>
            <div className="h-display text-2xl">{team.team.name}</div>
          </div>
          {!solo && (
            <div>
              <div className="label">Invite code. Share it with your teammates.</div>
              <div className="font-mono text-2xl tracking-[0.3em] text-gold">{team.team.inviteCode}</div>
            </div>
          )}
          <MemberList members={team.members} />
          {!solo && (
            <form action={renameMyTeamAction} className="flex gap-2">
              <input type="hidden" name="gameId" value={game.id} />
              <input className="input" name="name" placeholder="Rename team" maxLength={40} required />
              <button className="btn">Rename</button>
            </form>
          )}
          <form action={leaveTeamAction}>
            <input type="hidden" name="gameId" value={game.id} />
            <button className="btn btn-danger btn-sm">Leave team</button>
          </form>
        </div>
      ) : (
        <div className="card space-y-5">
          <form action={createTeamAction} className="space-y-2">
            <h2 className="h-display text-xl">{solo ? "Confirm you're in" : "Create a team"}</h2>
            <input type="hidden" name="gameId" value={game.id} />
            {!solo && <input className="input" name="name" placeholder="Team name" maxLength={40} required />}
            {solo && <input type="hidden" name="name" value="" />}
            <button className="btn btn-primary">{solo ? "Lock me in" : "Create team"}</button>
          </form>
          {!solo && (
            <form action={joinTeamAction} className="space-y-2 border-t border-line pt-4">
              <h2 className="h-display text-xl">Join a team</h2>
              <input type="hidden" name="gameId" value={game.id} />
              <input className="input font-mono uppercase" name="inviteCode" placeholder="Invite code" required />
              <button className="btn">Join team</button>
            </form>
          )}
          <p className="text-xs text-muted">
            {solo
              ? "If you skip this, an admin will put you in when the game starts."
              : "No team? Do nothing and an admin can place you on one before the game starts."}
          </p>
        </div>
      )}

      <div className="card space-y-3 self-start">
        <h2 className="h-display text-xl">Before it starts</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Read the <Link href="/rules" className="text-gold underline">rules</Link> and safe zones.</li>
          <li>Add a <Link href="/account" className="text-gold underline">photo</Link> so your hunters can recognize you. It&apos;s only fair.</li>
        </ul>
        <form action={leaveGameAction}>
          <input type="hidden" name="gameId" value={game.id} />
          <button className="btn btn-sm">Withdraw from game</button>
        </form>
      </div>
    </div>
  );
}

function MemberList({ members, showKills }: { members: Member[]; showKills?: boolean }) {
  return (
    <ul className="space-y-2">
      {members.map((m) => (
        <li key={m.participantId} className="flex items-center gap-3">
          <Avatar name={m.displayName} photo={m.photoPath} size={40} dead={m.status !== "alive"} />
          <div className="min-w-0 flex-1">
            <div className={m.status !== "alive" ? "text-muted line-through" : ""}>{m.displayName}</div>
            {showKills && <div className="text-xs text-muted">{m.kills} kill{m.kills === 1 ? "" : "s"}</div>}
          </div>
          {m.status !== "alive" && <StatusPill status={m.status} />}
        </li>
      ))}
    </ul>
  );
}

function FinishedPanel({ game }: { game: Game }) {
  const winner = game.winnerTeamId ? teamWithMembers(getDb(), game.winnerTeamId) : null;
  return (
    <div className="card text-center">
      <div className="label">Game over</div>
      {winner ? (
        <>
          <div className="h-display my-2 text-4xl text-gold">🏆 {winner.team.name}</div>
          <p className="text-sm text-muted">{winner.members.map((m) => m.displayName).join(", ")}</p>
        </>
      ) : (
        <p className="my-2">The game has ended.</p>
      )}
      <p className="mt-4 text-sm">
        <Link href="/leaderboard" className="text-gold underline">Final standings</Link> ·{" "}
        <Link href="/feed" className="text-gold underline">Full feed</Link>
      </p>
    </div>
  );
}

function PlayingPanel({ game, data }: { game: Game; data: ReturnType<typeof dashboard> }) {
  const { me, myTeam, target, teamReports, deadline } = data;
  if (!me || !myTeam) return null;
  const solo = myTeam.members.length === 1;
  const iAmAlive = me.status === "alive";
  const teamAlive = myTeam.team.status === "alive";
  const pendingVictims = new Set(teamReports.filter((r) => r.status === "pending").map((r) => r.victimName));

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="space-y-4 md:col-span-3">
        {!teamAlive ? (
          <div className="card border-blood text-center">
            <div className="h-display text-3xl text-blood">{solo ? "You've been eliminated" : "Your team has been wiped out"}</div>
            <p className="mt-2 text-sm text-muted">Thanks for playing. Keep watching the <Link href="/feed" className="underline">feed</Link>.</p>
          </div>
        ) : target ? (
          <div className="card border-blood/70">
            <div className="flex items-baseline justify-between gap-2">
              <div className="label text-blood">Your target{target.members.length > 1 ? " team" : ""}</div>
              {game.status === "paused" && <StatusPill status="paused" />}
            </div>
            {target.members.length > 1 && <div className="h-display mb-3 text-2xl">{target.team.name}</div>}
            {target.members.length === 1 ? (
              <div className="flex items-center gap-4 py-2">
                <Avatar name={target.members[0].displayName} photo={target.members[0].photoPath} size={96} />
                <div className="h-display text-3xl">{target.members[0].displayName}</div>
              </div>
            ) : (
              <MemberList members={target.members} />
            )}
            {deadline && (
              <p className={`mt-4 text-sm ${deadline - Date.now() < 86_400_000 ? "text-blood" : "text-muted"}`}>
                ⏳ {solo ? "You" : "Your team"} must get a kill {fmtRelative(deadline)} ({fmtDate(deadline)}) or risk being purged.
              </p>
            )}
          </div>
        ) : null}

        {teamAlive && iAmAlive && target && game.status === "active" && (
          <form action={submitKillAction} className="card space-y-3">
            <h2 className="h-display text-xl">Report a kill</h2>
            <input type="hidden" name="gameId" value={game.id} />
            <div>
              <label className="label" htmlFor="victimId">Who did you get?</label>
              <select className="input" id="victimId" name="victimId" required>
                {target.members
                  .filter((m) => m.status === "alive" && !pendingVictims.has(m.displayName))
                  .map((m) => (
                    <option key={m.participantId} value={m.participantId}>{m.displayName}</option>
                  ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="occurredAt">When</label>
                <input className="input" id="occurredAt" name="occurredAt" type="datetime-local" />
              </div>
              <div>
                <label className="label" htmlFor="location">Where</label>
                <input className="input" id="location" name="location" maxLength={200} placeholder="e.g. Colonial front lawn" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="description">How it went down</label>
              <textarea className="input" id="description" name="description" rows={3} maxLength={1000} placeholder="Witnesses help the admins verify." />
            </div>
            <button className="btn btn-primary">Submit for review</button>
          </form>
        )}
        {teamAlive && !iAmAlive && (
          <div className="card text-sm text-muted">You&apos;re out, but your team is still alive. Cheer them on!</div>
        )}
      </div>

      <div className="space-y-4 md:col-span-2">
        <div className="card">
          <div className="label">{solo ? "You" : "Your team"}</div>
          {!solo && <div className="h-display mb-3 text-xl">{myTeam.team.name}</div>}
          <MemberList members={myTeam.members} showKills />
          <p className="mt-3 text-xs text-muted">{myTeam.team.kills} total kill{myTeam.team.kills === 1 ? "" : "s"}</p>
        </div>

        {teamReports.length > 0 && (
          <div className="card">
            <div className="label">{solo ? "Your" : "Team"} kill reports</div>
            <ul className="space-y-2 text-sm">
              {teamReports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <StatusPill status={r.status} />
                  <span>
                    {!solo && <>{r.assassinName} → </>}
                    {r.victimName}
                  </span>
                  {r.status === "pending" && r.assassinId === me.id && (
                    <form action={withdrawKillAction} className="ml-auto">
                      <input type="hidden" name="reportId" value={r.id} />
                      <button className="text-xs text-muted underline">withdraw</button>
                    </form>
                  )}
                  {r.adminNote && r.status !== "pending" && <span className="w-full text-xs text-muted">“{r.adminNote}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
