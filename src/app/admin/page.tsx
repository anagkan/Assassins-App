import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import type { ReactNode } from "react";
import { Flash, PageTitle, StatusPill, fmtDate, fmtRelative } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { getDb, type DB } from "@/db";
import { games, type Game } from "@/db/schema";
import { getInactiveTeams, startChecklist } from "@/lib/game";
import { activeAnnouncements, activitySince, adminTeams, gameStats, pendingReports, unseenConfirmedReports } from "@/lib/queries";
import { AdminNav } from "./AdminNav";
import { createGameAction, deleteGameAction } from "./actions";

function suggestName() {
  const d = new Date();
  return `${d.getMonth() < 6 ? "Spring" : "Fall"} ${d.getFullYear()}`;
}

function Tile({ label, href, tone, children }: { label: string; href?: string; tone?: "warn" | "stop"; children: ReactNode }) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className={`text-2xl font-semibold ${tone === "stop" ? "text-stop-ink" : tone === "warn" ? "text-warn-ink" : ""}`}>{children}</div>
    </>
  );
  const cls = "block rounded-md border border-line p-3";
  return href ? <Link href={href} className={`${cls} hover:border-accent`}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** What needs doing in a game that's running or open for registration. */
function CurrentGame({ db, game, today }: { db: DB; game: Game; today: number }) {
  const base = `/admin/games/${game.id}`;
  const s = gameStats(db, game.id);
  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <Link href={base} className="h-display text-2xl hover:text-accent">{game.name}</Link>
      <StatusPill status={game.status} />
      {game.status === "paused" && game.pausedAt && <span className="text-xs text-ink-dim">since {fmtDate(game.pausedAt)}</span>}
    </div>
  );

  if (game.status === "registration") {
    const checks = startChecklist(db, game.id);
    const blocking = checks.filter((c) => c.blocking && !c.ok);
    const unassigned = adminTeams(db, game.id).unassigned.length;
    return (
      <section className="card space-y-3">
        {header}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Signed up" href={`${base}/teams`}>{s.players}</Tile>
          <Tile label="Teams" href={`${base}/teams`}>{s.teams}</Tile>
          <Tile label="Not on a team" href={`${base}/teams`} tone={unassigned ? "warn" : undefined}>{unassigned}</Tile>
          <Tile label="Sign-ups" href={base}>{game.signupsOpen ? "Open" : "Closed"}</Tile>
        </div>
        <p className="text-sm">
          {blocking.length ? (
            <>
              <span className="text-stop-ink">✗</span> {blocking.length} thing{blocking.length === 1 ? "" : "s"} to fix before you can start: {blocking[0].text}{" "}
              <Link href={base} className="underline">See the checklist</Link>
            </>
          ) : (
            <>
              <span className="text-ok-ink">✓</span> Ready to start. <Link href={base} className="underline">Start it from the Overview</Link>
            </>
          )}
        </p>
      </section>
    );
  }

  const pending = pendingReports(db, game.id);
  const disputed = pending.filter((r) => r.victimResponse === "disputed").length;
  const confirmed = unseenConfirmedReports(db, game.id).length;
  const overdue = getInactiveTeams(db, game.id);
  const live = activeAnnouncements(db, game.id);
  const day = activitySince(db, game.id, today);
  return (
    <section className="card space-y-3">
      {header}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Kills to review" href={`${base}/kills`} tone={pending.length ? "warn" : undefined}>
          {pending.length}
          {disputed > 0 && <span className="ml-2 text-sm font-normal text-stop-ink">{disputed} disputed</span>}
          {confirmed > 0 && <span className="block text-xs font-normal text-ink-dim">+ {confirmed} confirmed by victim to look over</span>}
        </Tile>
        <Tile label="Overdue teams" href={`${base}/ring`} tone={overdue.length ? "stop" : undefined}>
          {game.inactivityDays == null ? <span className="text-sm font-normal text-ink-dim">No limit set</span> : overdue.length}
        </Tile>
        <Tile label="Still in">
          {s.alivePlayers}<span className="text-sm font-normal text-ink-dim">/{s.players} players</span>
          <span className="block text-xs font-normal text-ink-dim">{s.aliveTeams}/{s.teams} teams</span>
        </Tile>
        <Tile label="Today">
          {day.approved} <span className="text-sm font-normal text-ink-dim">kill{day.approved === 1 ? "" : "s"}</span>
          <span className="block text-xs font-normal text-ink-dim">{day.reported} reported · {day.out} out</span>
        </Tile>
      </div>
      {overdue.length > 0 && (
        <p className="text-sm">
          Past their inactivity deadline: {overdue.map((o) => `${o.team.name} (${fmtRelative(o.deadline).replace(" ago", "")} over)`).join(", ")}.{" "}
          <Link href={`${base}/ring`} className="underline">Review</Link>
        </p>
      )}
      <div>
        <div className="label">Live now</div>
        {live.length === 0 ? (
          <p className="text-sm text-ink-dim">
            No immunities or rules of the day. <Link href={`${base}/announcements`} className="underline">Post one</Link>
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {live.map((a) => (
              <li key={a.id}>
                <span className="text-xs uppercase tracking-wider text-ink-dim">{a.kind}</span> <b>{a.title}</b>
                <span className="text-xs text-ink-dim"> · {a.activeUntil ? `ends ${fmtDate(a.activeUntil)}` : "no end"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export const metadata: Metadata = { title: "Games" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const all = db.select().from(games).orderBy(desc(games.id)).all();
  // Running games first, then any open for registration.
  const current = [...all.filter((g) => g.status === "active" || g.status === "paused"), ...all.filter((g) => g.status === "registration")];
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return (
    <>
      <PageTitle sub="Run a new game each semester. Past games stay archived.">Admin</PageTitle>
      <AdminNav current="/admin" />
      <Flash searchParams={sp} />

      {current.length > 0 && (
        <div className="mb-6 space-y-3">
          {current.map((g) => (
            <CurrentGame key={g.id} db={db} game={g} today={midnight.getTime()} />
          ))}
        </div>
      )}

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

      <h2 className="h-display mb-3 text-xl">All games</h2>
      <ul className="space-y-2">
        {all.map((g) => {
          const s = gameStats(db, g.id);
          const live = g.status === "active" || g.status === "paused";
          const pending = live ? pendingReports(db, g.id).length : 0;
          const confirmed = live ? unseenConfirmedReports(db, g.id).length : 0;
          return (
            <li key={g.id} className="card flex flex-wrap items-center gap-3 py-3">
              <Link href={`/admin/games/${g.id}`} className="h-display text-xl hover:text-accent">{g.name}</Link>
              <StatusPill status={g.status} />
              {pending > 0 && (
                <Link href={`/admin/games/${g.id}/kills`} className="pill chip-warn">{pending} pending kill{pending === 1 ? "" : "s"}</Link>
              )}
              {confirmed > 0 && (
                <Link href={`/admin/games/${g.id}/kills`} className="pill chip-ok">{confirmed} confirmed by victim{confirmed === 1 ? "" : "s"}</Link>
              )}
              <span className="text-xs text-ink-dim">
                {s.players} players · {s.teams} teams · created {fmtDate(g.createdAt)}
              </span>
              {g.status === "draft" && (
                <form action={deleteGameAction} className="ml-auto">
                  <input type="hidden" name="gameId" value={g.id} />
                  <ConfirmButton className="btn btn-danger btn-sm" message={`Delete the draft "${g.name}"? This can't be undone.`}>Delete draft</ConfirmButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
