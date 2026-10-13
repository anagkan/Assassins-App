import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Empty, StatusPill } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { getDb } from "@/db";
import type { Team } from "@/db/schema";
import { adminTeams, type Member } from "@/lib/queries";
import { teamAdminAction } from "../../../actions";
import { GameHeader, gameMetadata, loadGame } from "../../../GameHeader";

type Show = "all" | "alive" | "out";

export const generateMetadata = gameMetadata("Teams & players");

export default async function TeamsAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; q?: string; show?: string; view?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const game = loadGame(id);
  const { teams, unassigned, netIds } = adminTeams(getDb(), game.id);
  const reg = game.status === "registration";
  const live = game.status === "active" || game.status === "paused";
  const canRevive = live || game.status === "finished";
  const aliveTeams = teams.filter((t) => t.team.status === "alive");
  const base = `/admin/games/${game.id}/teams`;

  // Search and filter live in the URL; each action form sends them back so the redirect keeps them.
  const q = (sp.q ?? "").trim().toLowerCase();
  const show: Show = sp.show === "alive" || sp.show === "out" ? sp.show : "all";
  const view = sp.view === "players" ? "players" : "teams";
  const query = new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(show !== "all" ? { show } : {}), ...(view !== "teams" ? { view } : {}) }).toString();
  const hidden = (
    <>
      <input type="hidden" name="gameId" value={game.id} />
      {query && <input type="hidden" name="back" value={`?${query}`} />}
    </>
  );
  const filtering = q !== "" || show !== "all";
  const textMatch = (...fields: (string | null | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q));
  const statusMatch = (status: Member["status"]) => show === "all" || (show === "alive") === (status === "alive");
  const memberMatch = (m: Member, team: Team) => statusMatch(m.status) && textMatch(m.displayName, m.username, netIds.get(m.participantId), team.name);
  const shownTeams = teams
    .map((t) => ({ ...t, shown: t.members.filter((m) => memberMatch(m, t.team)) }))
    .filter((t) => !filtering || t.shown.length > 0 || (show === "all" && textMatch(t.team.name)));
  const shownUnassigned = unassigned.filter((p) => show !== "out" && textMatch(p.displayName, p.username, p.netId));
  const players = [
    ...shownTeams.flatMap(({ team, shown }) => shown.map((m) => ({ m, team }))),
    ...(reg ? shownUnassigned.map((p) => ({ m: { ...p, userId: 0, status: "alive" as const, kills: 0 }, team: null })) : []),
  ].sort((a, b) => a.m.displayName.localeCompare(b.m.displayName));
  const totalPlayers = teams.reduce((n, t) => n + t.members.length, 0) + unassigned.length;

  /** The Move / Remove / Revive forms for one player, folded away until the admin opens them. */
  function memberActions(m: { participantId: number; displayName: string; status: Member["status"] }, team: Team | null): ReactNode {
    const forms: ReactNode[] = [];
    if (reg) {
      forms.push(
        <form key="move" action={teamAdminAction} className="flex gap-1">
          {hidden}
          <input type="hidden" name="op" value="move" />
          <input type="hidden" name="participantId" value={m.participantId} />
          <select name="to" className="input py-1 text-xs" defaultValue={team?.id ?? "new"}>
            {team && <option value="">Unassigned</option>}
            <option value="new">New team</option>
            {teams.map((t) => (
              <option key={t.team.id} value={t.team.id}>{t.team.name} ({t.members.length})</option>
            ))}
          </select>
          <button className="btn btn-sm">{team ? "Move" : "Assign"}</button>
        </form>,
      );
      if (!team) {
        forms.push(
          <form key="kick" action={teamAdminAction}>
            {hidden}
            <input type="hidden" name="op" value="kick" />
            <input type="hidden" name="participantId" value={m.participantId} />
            <ConfirmButton className="btn btn-danger btn-sm" message={`Remove ${m.displayName} from this game?`}>Remove</ConfirmButton>
          </form>,
        );
      }
    }
    if (live && m.status === "alive") {
      forms.push(
        <form key="remove" action={teamAdminAction} className="flex gap-1">
          {hidden}
          <input type="hidden" name="op" value="removePlayer" />
          <input type="hidden" name="participantId" value={m.participantId} />
          <input className="input w-28 py-1 text-xs" name="reason" placeholder="reason" />
          <ConfirmButton className="btn btn-danger btn-sm" message={`Remove ${m.displayName} from the game? They'll be marked out.`}>Remove</ConfirmButton>
        </form>,
      );
    }
    if (canRevive && team && m.status !== "alive") {
      forms.push(
        <form key="revive" action={teamAdminAction} className="flex gap-1">
          {hidden}
          <input type="hidden" name="op" value="revive" />
          <input type="hidden" name="participantId" value={m.participantId} />
          {team.status !== "alive" && aliveTeams.length > 1 && (
            <select name="beforeTeamId" className="input py-1 text-xs" defaultValue="">
              <option value="">hunt random team</option>
              {aliveTeams.map((t) => (
                <option key={t.team.id} value={t.team.id}>hunt {t.team.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-sm">Revive</button>
        </form>,
      );
    }
    if (!forms.length) return null;
    return (
      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-ink-dim underline hover:text-ink group-open:mb-1">
          {reg ? (team ? "Move…" : "Assign…") : m.status === "alive" ? "Remove…" : "Revive…"}
        </summary>
        <div className="flex flex-wrap gap-1">{forms}</div>
      </details>
    );
  }

  return (
    <>
      <GameHeader id={id} current={base} sp={sp} />

      <form method="get" action={base} className="card mb-4 flex flex-wrap items-end gap-2 py-3">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">Search</label>
          <input className="input" id="q" name="q" type="search" defaultValue={sp.q} placeholder="Name, username, NetID or team" />
        </div>
        <div>
          <label className="label" htmlFor="show">Show</label>
          <select className="input" id="show" name="show" defaultValue={show}>
            <option value="all">Everyone</option>
            <option value="alive">Still in</option>
            <option value="out">Out</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="view">View</label>
          <select className="input" id="view" name="view" defaultValue={view}>
            <option value="teams">By team</option>
            <option value="players">One table of players</option>
          </select>
        </div>
        <button className="btn">Apply</button>
        {(filtering || view !== "teams") && <Link href={base} className="btn">Clear</Link>}
        {filtering && <p className="w-full text-xs text-ink-dim">Showing {players.length} of {totalPlayers} players.</p>}
      </form>

      {reg && view === "teams" && (
        <div className="card mb-4 space-y-3">
          <h2 className="h-display text-xl">Unassigned players ({unassigned.length})</h2>
          {unassigned.length === 0 ? (
            <p className="text-sm text-ink-dim">Everyone is on a team.</p>
          ) : (
            <>
              {shownUnassigned.length === 0 ? (
                <p className="text-sm text-ink-dim">No unassigned players match.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {shownUnassigned.map((p) => (
                    <li key={p.participantId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span className="flex-1">{p.displayName} <span className="text-ink-dim">@{p.username}</span></span>
                      {memberActions({ ...p, status: "alive" }, null)}
                    </li>
                  ))}
                </ul>
              )}
              <form action={teamAdminAction} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                {hidden}
                <input type="hidden" name="op" value="autofill" />
                <div>
                  <label className="label" htmlFor="size">Auto-fill into teams of</label>
                  <input className="input w-24" id="size" name="size" type="number" min={1} max={game.maxTeamSize ?? undefined} defaultValue={game.maxTeamSize ?? 2} />
                </div>
                <button className="btn btn-primary">Auto-fill randomly</button>
                <p className="w-full text-xs text-ink-dim">Tops up existing teams that are under this size first, then forms new random teams.</p>
              </form>
            </>
          )}
        </div>
      )}

      {view === "players" ? (
        <div className="card overflow-x-auto">
          {players.length === 0 ? (
            <Empty>No players match.</Empty>
          ) : (
            <table className="table text-sm">
              <thead>
                <tr><th>Player</th><th>NetID</th><th>Team</th>{!reg && <th>Status</th>}<th>Kills</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {players.map(({ m, team }) => (
                  <tr key={m.participantId}>
                    <td className={m.status !== "alive" ? "text-ink-dim line-through" : ""}>
                      {m.displayName} <span className="text-xs text-ink-dim">@{m.username}</span>
                    </td>
                    <td className="font-mono text-xs text-ink-dim">{netIds.get(m.participantId) ?? "—"}</td>
                    <td>{team?.name ?? <span className="text-ink-dim">Unassigned</span>}</td>
                    {!reg && <td><StatusPill status={m.status} /></td>}
                    <td>{m.kills}</td>
                    <td>{memberActions(m, team)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <>
          <h2 className="h-display mb-3 text-xl">Teams ({filtering ? `${shownTeams.length} of ${teams.length}` : teams.length})</h2>
          {shownTeams.length === 0 && <Empty>{teams.length ? "No teams match." : "No teams yet."}</Empty>}
          <div className="grid gap-3 md:grid-cols-2">
            {shownTeams.map(({ team, members, shown, targetName }) => (
              <div key={team.id} className={`card space-y-3 ${team.status !== "alive" ? "opacity-70" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="h-display flex-1 text-lg">{team.name}</h3>
                  {!reg && <StatusPill status={team.status} />}
                  <span className="text-xs text-ink-dim">{members.length} player{members.length === 1 ? "" : "s"} · {team.kills} kills</span>
                </div>
                {reg && <p className="text-xs text-ink-dim">Invite code <span className="font-mono text-accent">{team.inviteCode}</span></p>}
                {targetName && <p className="text-sm">Hunting <b>{targetName}</b></p>}

                <ul className="space-y-2">
                  {shown.map((m) => (
                    <li key={m.participantId} className="flex flex-wrap items-center gap-2 text-sm">
                      <Avatar name={m.displayName} size={28} dead={m.status !== "alive"} />
                      <span className={`flex-1 ${m.status !== "alive" ? "text-ink-dim line-through" : ""}`}>
                        {m.displayName} <span className="text-xs text-ink-dim">@{m.username}</span>
                      </span>
                      {!reg && m.status !== "alive" && <StatusPill status={m.status} />}
                      {memberActions(m, team)}
                    </li>
                  ))}
                  {shown.length < members.length && (
                    <li className="text-xs text-ink-dim">+ {members.length - shown.length} hidden by the filter</li>
                  )}
                </ul>

                {reg && (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <form action={teamAdminAction} className="flex gap-1">
                      {hidden}
                      <input type="hidden" name="op" value="rename" />
                      <input type="hidden" name="teamId" value={team.id} />
                      <input className="input w-36 py-1 text-xs" name="name" placeholder="New name" required />
                      <button className="btn btn-sm">Rename</button>
                    </form>
                    {teams.length > 1 && (
                      <form action={teamAdminAction} className="flex gap-1">
                        {hidden}
                        <input type="hidden" name="op" value="merge" />
                        <input type="hidden" name="teamId" value={team.id} />
                        <select name="intoTeamId" className="input py-1 text-xs">
                          {teams.filter((t) => t.team.id !== team.id).map((t) => (
                            <option key={t.team.id} value={t.team.id}>{t.team.name}</option>
                          ))}
                        </select>
                        <button className="btn btn-sm">Merge into</button>
                      </form>
                    )}
                  </div>
                )}
                {live && team.status === "alive" && (
                  <form action={teamAdminAction} className="flex gap-1 border-t border-line pt-3">
                    {hidden}
                    <input type="hidden" name="op" value="removeTeam" />
                    <input type="hidden" name="teamId" value={team.id} />
                    <input className="input py-1 text-xs" name="reason" placeholder="reason (e.g. disqualified)" />
                    <ConfirmButton className="btn btn-danger btn-sm whitespace-nowrap" message={`Remove ${team.name}? Every member is marked out and their hunters inherit their target.`}>Remove team</ConfirmButton>
                  </form>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
