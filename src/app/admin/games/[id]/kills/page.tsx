import { ConfirmButton } from "@/components/confirm";
import { Empty, StatusPill, fmtDate, fmtDuration } from "@/components/ui";
import { getDb } from "@/db";
import { pendingReports, rejectedCountsByTeam, reportRows, unseenConfirmedReports } from "@/lib/queries";
import { acknowledgeKillAction, reviewKillAction, undoKillAction } from "../../../actions";
import { GameHeader, gameMetadata, loadGame } from "../../../GameHeader";

/** One-click reasons beside Reject. A typed note is added after the reason. */
const QUICK_REJECT_REASONS = ["In a safe zone", "Against the rules", "Not enough detail"];

export const generateMetadata = gameMetadata("Kill queue");

export default async function KillQueue({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = loadGame(id);
  const db = getDb();
  const pending = pendingReports(db, game.id);
  const confirmed = unseenConfirmedReports(db, game.id);
  const history = reportRows(db, game.id).filter((r) => r.status !== "pending");
  const rejected = rejectedCountsByTeam(db, game.id);
  // An approved kill can be undone while the victim is still out from that very kill.
  const canUndo = (r: (typeof history)[number]) =>
    r.status === "approved" && r.victimStatus === "eliminated" && r.victimEliminatedById === r.assassinId && game.status !== "registration";
  const undo = (r: (typeof history)[number]) =>
    canUndo(r) && (
      <form action={undoKillAction}>
        <input type="hidden" name="gameId" value={game.id} />
        <input type="hidden" name="reportId" value={r.id} />
        <ConfirmButton className="btn btn-sm" message={`Undo ${r.killer}'s kill on ${r.victim}? ${r.victim} comes back to life and the kill credit is taken back.`}>Undo</ConfirmButton>
      </form>
    );
  const team = (name: string | null, person: string) => (name && name !== person ? <span className="text-ink-dim"> ({name})</span> : null);

  return (
    <>
      <GameHeader id={id} current={`/admin/games/${game.id}/kills`} />
      {confirmed.length > 0 && (
        <section className="mb-8">
          <div className="mb-1 flex flex-wrap items-baseline gap-3">
            <h2 className="h-display text-xl">Confirmed by the victim ({confirmed.length})</h2>
            {confirmed.length > 1 && (
              <form action={acknowledgeKillAction} className="ml-auto">
                <input type="hidden" name="gameId" value={game.id} />
                <button className="btn btn-sm">Mark all seen</button>
              </form>
            )}
          </div>
          <p className="mb-3 text-sm text-ink-dim">
            These victims confirmed the kill themselves, so it was approved automatically. If one looks wrong, undo it.
          </p>
          <div className="space-y-3">
            {confirmed.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center gap-3 border-ok-ink">
                <div className="min-w-0 flex-1">
                  <p>
                    <b>{r.killer}</b>{team(r.killerTeam, r.killer)} <span className="text-stop-ink">eliminated</span> <b>{r.victim}</b>{team(r.victimTeam, r.victim)}
                  </p>
                  <p className="text-xs text-ink-dim">
                    Happened {fmtDate(r.occurredAt)}{r.location && <> at {r.location}</>} · confirmed {fmtDate(r.victimRespondedAt ?? r.reviewedAt ?? r.createdAt)}
                  </p>
                  {r.description && <p className="mt-2 whitespace-pre-line rounded-sm bg-surface-sunken p-3 text-sm">{r.description}</p>}
                </div>
                <div className="flex gap-2">
                  {undo(r)}
                  <form action={acknowledgeKillAction}>
                    <input type="hidden" name="gameId" value={game.id} />
                    <input type="hidden" name="reportId" value={r.id} />
                    <button className="btn btn-sm">Got it</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <h2 className="h-display mb-3 text-xl">Pending ({pending.length})</h2>
      {pending.length === 0 && <Empty>Nothing to review.</Empty>}
      <div className="space-y-3">
        {pending.map((r) => {
          const priorRejects = r.killerTeamId != null ? (rejected.get(r.killerTeamId) ?? 0) : 0;
          return (
            <div key={r.id} className={`card space-y-2 ${r.problem ? "border-warn-ink" : "border-line"}`}>
              <p className="text-lg">
                <b>{r.killer}</b>{team(r.killerTeam, r.killer)} <span className="text-stop-ink">eliminated</span> <b>{r.victim}</b>{team(r.victimTeam, r.victim)}
              </p>
              <p className="text-xs text-ink-dim">
                Happened {fmtDate(r.occurredAt)}{r.location && <> at {r.location}</>} · reported {fmtDate(r.createdAt)}, {fmtDuration(r.createdAt - r.occurredAt)} later
              </p>
              {priorRejects > 0 && (
                <p className="text-xs text-warn-ink">
                  {r.killerTeam && r.killerTeam !== r.killer ? r.killerTeam : r.killer} has had {priorRejects} earlier report{priorRejects === 1 ? "" : "s"} rejected this game.
                </p>
              )}
              {r.description && <p className="whitespace-pre-line rounded-sm bg-surface-sunken p-3 text-sm">{r.description}</p>}
              {r.victimResponse === "disputed" ? (
                <div className="rounded-sm bg-stop px-3 py-2 text-sm text-stop-ink">
                  <b>{r.victim} disputes this</b>
                  {r.victimRespondedAt && <span className="text-xs"> · {fmtDate(r.victimRespondedAt)}</span>}
                  <p className="mt-1 whitespace-pre-line">{r.victimNote}</p>
                </div>
              ) : (
                <p className="text-xs text-ink-dim">{r.victim} hasn&apos;t responded yet. If they confirm it, it&apos;s approved automatically.</p>
              )}
              {r.problem && <p className="rounded-sm bg-warn px-3 py-2 text-sm text-(--warn-chip-ink)">{r.problem} Approving will mark it stale.</p>}
              <form action={reviewKillAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="gameId" value={game.id} />
                <input type="hidden" name="reportId" value={r.id} />
                <input className="input flex-1 py-1 text-sm" name="note" placeholder="Note to the player (optional)" />
                <button name="decision" value="approve" className="btn btn-primary btn-sm">Approve</button>
                <button name="decision" value="reject" className="btn btn-danger btn-sm">Reject</button>
                <div className="flex w-full flex-wrap items-center gap-1 text-xs text-ink-dim">
                  Reject because:
                  {QUICK_REJECT_REASONS.map((reason) => (
                    <button key={reason} name="decision" value={`reject:${reason}`} className="btn btn-sm">{reason}</button>
                  ))}
                </div>
              </form>
            </div>
          );
        })}
      </div>

      <h2 className="h-display mb-3 mt-8 text-xl">History</h2>
      {history.length === 0 ? (
        <Empty>No reviewed reports.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Status</th><th>Kill</th><th>When</th><th>Victim</th><th>Note</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td><StatusPill status={r.status} /></td>
                  <td>{r.killer} → {r.victim}</td>
                  <td className="whitespace-nowrap text-ink-dim">{fmtDate(r.occurredAt)}</td>
                  <td className="text-ink-dim" title={r.victimNote ?? undefined}>{r.victimResponse ?? ""}</td>
                  <td className="text-ink-dim">{r.adminNote}</td>
                  <td>{undo(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-dim">Undo reverses an approved kill while the victim is still out from it. Otherwise, revive the victim from Teams &amp; players.</p>
    </>
  );
}
