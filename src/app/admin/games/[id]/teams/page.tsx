import { Avatar, Empty, StatusPill } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { getDb } from "@/db";
import { adminTeams } from "@/lib/queries";
import { teamAdminAction } from "../../../actions";
import { GameHeader, loadGame } from "../../../GameHeader";

export default async function TeamsAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const game = loadGame(id);
  const { teams, unassigned } = adminTeams(getDb(), game.id);
  const reg = game.status === "registration";
  const live = game.status === "active" || game.status === "paused";
  const canRevive = live || game.status === "finished";
  const aliveTeams = teams.filter((t) => t.team.status === "alive");
  const hidden = <input type="hidden" name="gameId" value={game.id} />;

  return (
    <>
      <GameHeader id={id} current={`/admin/games/${game.id}/teams`} sp={sp} />

      {reg && (
        <div className="card mb-4 space-y-3">
          <h2 className="h-display text-xl">Unassigned players ({unassigned.length})</h2>
          {unassigned.length === 0 ? (
            <p className="text-sm text-ink-dim">Everyone is on a team.</p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {unassigned.map((p) => (
                  <li key={p.participantId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="flex-1">{p.displayName} <span className="text-ink-dim">@{p.username}</span></span>
                    <form action={teamAdminAction} className="flex gap-1">
                      {hidden}
                      <input type="hidden" name="op" value="move" />
                      <input type="hidden" name="participantId" value={p.participantId} />
                      <select name="to" className="input py-1 text-xs" defaultValue="new">
                        <option value="new">New team</option>
                        {teams.map((t) => (
                          <option key={t.team.id} value={t.team.id}>{t.team.name} ({t.members.length})</option>
                        ))}
                      </select>
                      <button className="btn btn-sm">Assign</button>
                    </form>
                    <form action={teamAdminAction}>
                      {hidden}
                      <input type="hidden" name="op" value="kick" />
                      <input type="hidden" name="participantId" value={p.participantId} />
                      <ConfirmButton className="btn btn-danger btn-sm" message={`Remove ${p.displayName} from this game?`}>Remove</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
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

      <h2 className="h-display mb-3 text-xl">Teams ({teams.length})</h2>
      {teams.length === 0 && <Empty>No teams yet.</Empty>}
      <div className="grid gap-3 md:grid-cols-2">
        {teams.map(({ team, members, targetName }) => (
          <div key={team.id} className={`card space-y-3 ${team.status !== "alive" ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="h-display flex-1 text-lg">{team.name}</h3>
              {!reg && <StatusPill status={team.status} />}
              <span className="text-xs text-ink-dim">{members.length} player{members.length === 1 ? "" : "s"} · {team.kills} kills</span>
            </div>
            {reg && <p className="text-xs text-ink-dim">Invite code <span className="font-mono text-accent">{team.inviteCode}</span></p>}
            {targetName && <p className="text-sm">Hunting <b>{targetName}</b></p>}

            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.participantId} className="flex flex-wrap items-center gap-2 text-sm">
                  <Avatar name={m.displayName} size={28} dead={m.status !== "alive"} />
                  <span className={`flex-1 ${m.status !== "alive" ? "text-ink-dim line-through" : ""}`}>
                    {m.displayName} <span className="text-xs text-ink-dim">@{m.username}</span>
                  </span>
                  {!reg && m.status !== "alive" && <StatusPill status={m.status} />}
                  {reg && (
                    <form action={teamAdminAction} className="flex gap-1">
                      {hidden}
                      <input type="hidden" name="op" value="move" />
                      <input type="hidden" name="participantId" value={m.participantId} />
                      <select name="to" className="input py-1 text-xs" defaultValue={team.id}>
                        <option value="">Unassigned</option>
                        <option value="new">New team</option>
                        {teams.map((t) => (
                          <option key={t.team.id} value={t.team.id}>{t.team.name}</option>
                        ))}
                      </select>
                      <button className="btn btn-sm">Move</button>
                    </form>
                  )}
                  {live && m.status === "alive" && (
                    <form action={teamAdminAction} className="flex gap-1">
                      {hidden}
                      <input type="hidden" name="op" value="removePlayer" />
                      <input type="hidden" name="participantId" value={m.participantId} />
                      <input className="input w-28 py-1 text-xs" name="reason" placeholder="reason" />
                      <ConfirmButton className="btn btn-danger btn-sm" message={`Remove ${m.displayName} from the game? They'll be marked out.`}>Remove</ConfirmButton>
                    </form>
                  )}
                  {canRevive && m.status !== "alive" && (
                    <form action={teamAdminAction} className="flex gap-1">
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
                    </form>
                  )}
                </li>
              ))}
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
  );
}
