import Link from "next/link";
import { ConfirmButton } from "@/components/confirm";
import { ShareCode } from "@/components/ShareCode";
import { Flash } from "@/components/Flash";
import { Avatar, PageTitle, StatusPill, fmtDate, fmtDuration, fmtRelative } from "@/components/ui";
import { getDb } from "@/db";
import type { Announcement, Game } from "@/db/schema";
import { getCurrentGame } from "@/lib/game";
import { readInvite, type Invite } from "@/lib/invite";
import { activeAnnouncements, dashboard, gameStats, teamWithMembers, type Member } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import {
  createTeamAction,
  joinGameAction,
  joinTeamAction,
  leaveGameAction,
  leaveTeamAction,
  renameMyTeamAction,
  respondToKillAction,
  submitKillAction,
  withdrawKillAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SP = Promise<{ join?: string; team?: string }>;

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const invite = readInvite(sp);
  const db = getDb();
  const game = getCurrentGame(db);

  if (!game) {
    return (
      <>
        <Flash />
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
      <Flash />
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
        user.isAdmin ? <AdminPanel /> : <JoinPanel game={game} invite={invite} />
      ) : game.status === "registration" ? (
        <RegistrationPanel game={game} teamId={data.me.teamId} invite={invite} />
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
          className="rounded-md border border-line bg-surface px-4 py-3"
        >
          <div className="text-[0.78rem] text-ink-dim">
            <span className={`pill uppercase tracking-[0.05em] ${a.kind === "immunity" ? "chip-ok" : a.kind === "rule" ? "chip-warn" : "chip-info"}`}>
              {a.kind === "immunity" ? "Immunity" : a.kind === "rule" ? "Rule" : "Announcement"}
            </span>
            {a.activeUntil && <span className="ml-2 font-normal normal-case">until {fmtDate(a.activeUntil)}</span>}
          </div>
          <div className="mt-0.5 font-semibold">{a.title}</div>
          {a.body && <p className="mt-1 whitespace-pre-line text-sm text-ink-dim">{a.body}</p>}
        </div>
      ))}
    </div>
  );
}

function AdminPanel() {
  return (
    <div className="card space-y-3">
      <p>Admin accounts run the game and can&apos;t play in it.</p>
      <Link href="/admin" className="btn btn-primary">Admin console</Link>
    </div>
  );
}

function JoinPanel({ game, invite }: { game: Game; invite: Invite }) {
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
        <p>You aren&apos;t playing in this game. Follow along on the <Link href="/feed" className="text-accent underline">feed</Link>.</p>
      </div>
    );
  }
  return (
    <form action={joinGameAction} className="card max-w-md space-y-3">
      <h2 className="h-display text-xl">Join {game.name}</h2>
      <input type="hidden" name="gameId" value={game.id} />
      {invite.team && <input type="hidden" name="inviteCode" value={invite.team} />}
      <div>
        <label className="label" htmlFor="joinCode">Join code</label>
        <input className="input uppercase" id="joinCode" name="joinCode" defaultValue={invite.join} required autoCapitalize="characters" />
        {invite.team && (
          <p className="mt-1 text-xs text-ink-dim">
            You&apos;ll join the team with invite code <span className="font-mono text-accent">{invite.team}</span> at the same time.
            {!invite.join && " Get the game's join code from the club officers."}
          </p>
        )}
      </div>
      <button className="btn btn-primary">{invite.team ? "Join game and team" : "Join game"}</button>
    </form>
  );
}

function teamLimitText(game: Game) {
  if (game.maxTeamSize === 1) return "This is a solo game: everyone plays on their own.";
  const max = game.maxTeamSize == null ? "any number of" : `up to ${game.maxTeamSize}`;
  return `Teams can have ${max} players${game.minTeamSize > 1 ? ` (minimum ${game.minTeamSize})` : ""}.`;
}

function RegistrationPanel({ game, teamId, invite }: { game: Game; teamId: number | null; invite: Invite }) {
  const db = getDb();
  const team = teamId != null ? teamWithMembers(db, teamId) : null;
  const solo = game.maxTeamSize === 1;
  // A team link for a different team than the one you're on: offer to switch.
  const switchTo = !solo && team && invite.team && invite.team !== team.team.inviteCode ? invite.team : undefined;
  // Leaving (or switching off) a team you're alone on deletes it.
  const lastOne = team?.members.length === 1;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card md:col-span-2">
        <p className="text-sm">
          You&apos;re signed up. The game hasn&apos;t started yet; your target will appear here when it does.{" "}
          <span className="text-ink-dim">{teamLimitText(game)}</span>
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
              <div className="flex flex-wrap items-center gap-3">
                <div className="font-mono text-2xl tracking-[0.3em] text-accent">{team.team.inviteCode}</div>
                <ShareCode path={`/team/${team.team.inviteCode}`} title={`Join ${team.team.name} in ${game.name}`} />
              </div>
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
            <ConfirmButton
              className="btn btn-danger btn-sm"
              message={
                lastOne
                  ? `Leave ${team.team.name}? You're its only member, so the team will be deleted.`
                  : `Leave ${team.team.name}? You'll need its invite code to rejoin.`
              }
            >
              Leave team
            </ConfirmButton>
          </form>
          {switchTo && (
            <form action={joinTeamAction} className="space-y-2 border-t border-line pt-4">
              <p className="text-sm">
                You opened an invite link for another team (<span className="font-mono text-accent">{switchTo}</span>). Joining it takes you off {team.team.name}.
              </p>
              <input type="hidden" name="gameId" value={game.id} />
              <input type="hidden" name="inviteCode" value={switchTo} />
              <ConfirmButton
                className="btn btn-sm"
                message={`Leave ${team.team.name} and join the other team?${lastOne ? ` You're its only member, so ${team.team.name} will be deleted.` : ""}`}
              >
                Switch to that team
              </ConfirmButton>
            </form>
          )}
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
              <input className="input font-mono uppercase" name="inviteCode" placeholder="Invite code" defaultValue={invite.team} required autoCapitalize="characters" />
              <button className="btn">Join team</button>
            </form>
          )}
          <p className="text-xs text-ink-dim">
            {solo
              ? "If you skip this, an admin will put you in when the game starts."
              : "No team? Do nothing and an admin can place you on one before the game starts."}
          </p>
        </div>
      )}

      <div className="card space-y-3 self-start">
        <h2 className="h-display text-xl">Before it starts</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>Read the <Link href="/rules" className="text-accent underline">rules</Link> and safe zones.</li>
        </ul>
        <form action={leaveGameAction}>
          <input type="hidden" name="gameId" value={game.id} />
          <ConfirmButton
            className="btn btn-sm"
            message={`Withdraw from ${game.name}?${team ? ` You'll come off ${team.team.name}.` : ""} You'll need the join code to sign up again.`}
          >
            Withdraw from game
          </ConfirmButton>
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
          <Avatar name={m.displayName} size={40} dead={m.status !== "alive"} />
          <div className="min-w-0 flex-1">
            <div className={m.status !== "alive" ? "text-ink-dim line-through" : ""}>{m.displayName}</div>
            {showKills && <div className="text-xs text-ink-dim">{m.kills} kill{m.kills === 1 ? "" : "s"}</div>}
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
          <div className="h-display my-2 text-4xl text-accent">{winner.team.name}</div>
          <p className="text-sm text-ink-dim">{winner.members.map((m) => m.displayName).join(", ")}</p>
        </>
      ) : (
        <p className="my-2">The game has ended.</p>
      )}
      <p className="mt-4 text-sm">
        <Link href="/leaderboard" className="text-accent underline">Final standings</Link> ·{" "}
        <Link href="/feed" className="text-accent underline">Full feed</Link>
      </p>
    </div>
  );
}

function PlayingPanel({ game, data }: { game: Game; data: ReturnType<typeof dashboard> }) {
  const { me, myTeam, target, teamReports, againstMe, reportsAgainstMe, out, deadline } = data;
  if (!me || !myTeam) return null;
  const solo = myTeam.members.length === 1;
  const iAmAlive = me.status === "alive";
  const teamAlive = myTeam.team.status === "alive";
  const pendingVictims = new Set(teamReports.filter((r) => r.status === "pending").map((r) => r.victimName));

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="space-y-4 md:col-span-3">
        {iAmAlive && againstMe.map((r) => <KillClaim key={r.id} report={r} />)}

        {!teamAlive ? (
          <div className="rounded-lg bg-stop px-5 py-6 text-center text-stop-ink">
            <div className="h-display text-3xl text-stop-ink">{solo ? "You've been eliminated" : "Your team has been wiped out"}</div>
            {out && <p className="mt-2"><HowIWentOut out={out} /></p>}
            {!solo && (
              <p className="mt-1 text-sm">
                {myTeam.team.status === "purged"
                  ? "Your team was removed from the game."
                  : out?.teamOutBy
                    ? <>{out.teamOutBy} took out the last of your team.</>
                    : null}
              </p>
            )}
            <p className="mt-2 text-sm">Thanks for playing. Keep watching the <Link href="/feed" className="underline">feed</Link>.</p>
          </div>
        ) : target ? (
          <div className="card border-accent">
            <div className="flex items-baseline justify-between gap-2">
              <div className="label text-accent">Your target{target.members.length > 1 ? " team" : ""}</div>
              {game.status === "paused" && <StatusPill status="paused" />}
            </div>
            {target.members.length > 1 && <div className="h-display mb-3 text-2xl">{target.team.name}</div>}
            {target.members.length === 1 ? (
              <div className="flex items-center gap-4 py-2">
                <Avatar name={target.members[0].displayName} size={96} />
                <div className="h-display min-w-0 break-words text-3xl">{target.members[0].displayName}</div>
              </div>
            ) : (
              <MemberList members={target.members} />
            )}
            {deadline && (
              <p className={`mt-4 text-sm ${deadline - Date.now() < 86_400_000 ? "text-warn-ink" : "text-ink-dim"}`}>
                {solo ? "You" : "Your team"} must get a kill {fmtRelative(deadline)} ({fmtDate(deadline)}) or risk being purged.
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
            <button className="btn btn-primary">Submit report</button>
          </form>
        )}
        {teamAlive && !iAmAlive && (
          <div className="card space-y-1">
            {out && <p><HowIWentOut out={out} /></p>}
            <p className="text-sm text-ink-dim">You&apos;re out, but your team is still alive. Cheer them on!</p>
          </div>
        )}
        {out && <OutStats out={out} />}
      </div>

      <div className="space-y-4 md:col-span-2">
        <div className="card">
          <div className="label">{solo ? "You" : "Your team"}</div>
          {!solo && <div className="h-display mb-3 text-xl">{myTeam.team.name}</div>}
          <MemberList members={myTeam.members} showKills />
          <p className="mt-3 text-xs text-ink-dim">{myTeam.team.kills} total kill{myTeam.team.kills === 1 ? "" : "s"}</p>
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
                  {r.victimResponse === "confirmed" && <span className="text-xs text-ink-dim">confirmed by {r.victimName}</span>}
                  {r.victimResponse === "disputed" && r.status === "pending" && (
                    <span className="text-xs text-warn-ink">disputed, waiting on an admin</span>
                  )}
                  {r.status === "pending" && r.assassinId === me.id && (
                    <form action={withdrawKillAction} className="ml-auto">
                      <input type="hidden" name="reportId" value={r.id} />
                      <ConfirmButton
                        className="px-1 py-1.5 text-xs text-ink-dim underline"
                        message={`Withdraw your report on ${r.victimName}? It will be deleted; you'd have to report the kill again.`}
                      >
                        withdraw
                      </ConfirmButton>
                    </form>
                  )}
                  {r.adminNote && r.status !== "pending" && <span className="w-full text-xs text-ink-dim">“{r.adminNote}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reportsAgainstMe.length > 0 && (
          <div className="card">
            <div className="label">Reports against you</div>
            <ul className="space-y-2 text-sm">
              {reportsAgainstMe.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <StatusPill status={r.status} />
                  <span>{r.assassinName} said they got you</span>
                  {r.victimResponse === "confirmed" && <span className="text-xs text-ink-dim">you confirmed</span>}
                  {r.victimResponse === "disputed" && <span className="text-xs text-ink-dim">you disputed</span>}
                  {r.adminNote && r.status !== "approved" && <span className="w-full text-xs text-ink-dim">“{r.adminNote}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

type Out = NonNullable<Extract<ReturnType<typeof dashboard>, { out: unknown }>["out"]>;

function HowIWentOut({ out }: { out: Out }) {
  if (out.status === "purged") return <>You were removed from the game {fmtRelative(out.at)} ({fmtDate(out.at)}).</>;
  if (!out.killer) return <>You went out {fmtRelative(out.at)} ({fmtDate(out.at)}).</>;
  const when = out.occurredAt ?? out.at;
  return (
    <>
      <b>{out.killer}</b> got you {fmtRelative(when)} ({fmtDate(when)}){out.location && <> at {out.location}</>}.
    </>
  );
}

function OutStats({ out }: { out: Out }) {
  const stats = [
    { label: "Your kills", value: String(out.kills) },
    ...(out.survivedMs != null ? [{ label: "Survived", value: fmtDuration(out.survivedMs) }] : []),
    { label: "Outlasted", value: `${out.outlasted} of ${out.players - 1}` },
  ];
  return (
    <div className="card">
      <div className="label">Your game</div>
      <dl className="grid grid-cols-3 gap-3 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-ink-dim">{s.label}</dt>
            <dd className="h-display text-2xl">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type Claim = Extract<ReturnType<typeof dashboard>, { againstMe: unknown }>["againstMe"][number];

function KillClaim({ report: r }: { report: Claim }) {
  return (
    <div className="card space-y-3 border-warn-ink">
      <div className="label text-stop-ink">Were you taken out?</div>
      <p className="text-lg">
        <b>{r.assassinName}</b> says they got you {fmtRelative(r.occurredAt)}
        {r.location && <> at {r.location}</>}.
      </p>
      {r.description && <p className="whitespace-pre-line rounded-sm bg-surface-sunken p-3 text-sm">{r.description}</p>}
      {r.victimResponse === "disputed" ? (
        <p className="text-sm text-ink-dim">You disputed this. The admins will decide and you&apos;ll see the result here.</p>
      ) : (
        <>
          <p className="text-sm text-ink-dim">
            If it&apos;s fair, confirm it and you&apos;re out right away. If not, dispute it and an admin will decide.
          </p>
          <form action={respondToKillAction}>
            <input type="hidden" name="reportId" value={r.id} />
            <ConfirmButton
              name="response"
              value="confirm"
              className="btn btn-primary"
              message={`Confirm that ${r.assassinName} got you? You'll be out of the game right away.`}
            >
              Confirm, I&apos;m out
            </ConfirmButton>
          </form>
          <details className="border-t border-line pt-3">
            <summary className="cursor-pointer text-sm">Dispute it</summary>
            <form action={respondToKillAction} className="mt-2 space-y-2">
              <input type="hidden" name="reportId" value={r.id} />
              <textarea
                className="input"
                name="note"
                rows={3}
                maxLength={1000}
                required
                placeholder="What really happened? e.g. I was in a safe zone, or had immunity."
              />
              <button name="response" value="dispute" className="btn btn-danger">Send dispute</button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
