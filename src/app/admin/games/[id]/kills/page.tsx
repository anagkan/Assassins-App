import { Empty, StatusPill, fmtDate } from "@/components/ui";
import { getDb } from "@/db";
import { pendingReports, reportRows } from "@/lib/queries";
import { reviewKillAction } from "../../../actions";
import { GameHeader, loadGame } from "../../../GameHeader";

export default async function KillQueue({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const game = loadGame(id);
  const db = getDb();
  const pending = pendingReports(db, game.id);
  const history = reportRows(db, game.id).filter((r) => r.status !== "pending");
  const team = (name: string | null, person: string) => (name && name !== person ? <span className="text-ink-dim"> ({name})</span> : null);

  return (
    <>
      <GameHeader id={id} current={`/admin/games/${game.id}/kills`} sp={sp} />
      <h2 className="h-display mb-3 text-xl">Pending ({pending.length})</h2>
      {pending.length === 0 && <Empty>Nothing to review.</Empty>}
      <div className="space-y-3">
        {pending.map((r) => (
          <div key={r.id} className={`card space-y-2 ${r.problem ? "border-warn-ink" : "border-line"}`}>
            <p className="text-lg">
              <b>{r.killer}</b>{team(r.killerTeam, r.killer)} <span className="text-stop-ink">eliminated</span> <b>{r.victim}</b>{team(r.victimTeam, r.victim)}
            </p>
            <p className="text-xs text-ink-dim">
              Happened {fmtDate(r.occurredAt)}{r.location && <> at {r.location}</>} · reported {fmtDate(r.createdAt)}
            </p>
            {r.description && <p className="whitespace-pre-line rounded-sm bg-surface-sunken p-3 text-sm">{r.description}</p>}
            {r.problem && <p className="rounded-sm bg-warn px-3 py-2 text-sm text-(--warn-chip-ink)">{r.problem} Approving will mark it stale.</p>}
            <form action={reviewKillAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="gameId" value={game.id} />
              <input type="hidden" name="reportId" value={r.id} />
              <input className="input flex-1 py-1 text-sm" name="note" placeholder="Note to the player (optional)" />
              <button name="decision" value="approve" className="btn btn-primary btn-sm">Approve</button>
              <button name="decision" value="reject" className="btn btn-danger btn-sm">Reject</button>
            </form>
          </div>
        ))}
      </div>

      <h2 className="h-display mb-3 mt-8 text-xl">History</h2>
      {history.length === 0 ? (
        <Empty>No reviewed reports.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Status</th><th>Kill</th><th>When</th><th>Note</th></tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td><StatusPill status={r.status} /></td>
                  <td>{r.killer} → {r.victim}</td>
                  <td className="whitespace-nowrap text-ink-dim">{fmtDate(r.occurredAt)}</td>
                  <td className="text-ink-dim">{r.adminNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-dim">To reverse an approved kill, revive the victim from Teams &amp; players.</p>
    </>
  );
}
