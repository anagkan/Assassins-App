import Link from "next/link";
import { and, desc, eq, isNull, like, type SQL } from "drizzle-orm";
import { PageTitle, fmtDate } from "@/components/ui";
import { getDb } from "@/db";
import { auditLog, games, users } from "@/db/schema";
import { AUDIT_ACTIONS, AUDIT_GROUPS, auditNames, describeAudit, parsePayload } from "@/lib/auditText";
import { AdminNav } from "../AdminNav";

const PAGE_SIZE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; game?: string; action?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const db = getDb();
  const allGames = db.select({ id: games.id, name: games.name }).from(games).orderBy(desc(games.id)).all();

  // game: a game id, or "none" for site-wide entries. action: an exact action, or a group like "kill.".
  const game = sp.game ?? "";
  const action = sp.action ?? "";
  const where: SQL[] = [];
  if (game === "none") where.push(isNull(auditLog.gameId));
  else if (/^\d+$/.test(game)) where.push(eq(auditLog.gameId, Number(game)));
  if (action.endsWith(".") && AUDIT_GROUPS[action.slice(0, -1)]) where.push(like(auditLog.action, `${action}%`));
  else if (action) where.push(eq(auditLog.action, action));

  const rows = db
    .select({ log: auditLog, actor: users.displayName, game: games.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .leftJoin(games, eq(games.id, auditLog.gameId))
    .where(and(...where))
    .orderBy(desc(auditLog.id))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE)
    .all()
    .map((r) => ({ ...r, payload: parsePayload(r.log.payloadJson) }));
  const names = auditNames(db, rows.map((r) => r.payload));

  const pageHref = (p: number) => `/admin/audit?${new URLSearchParams({ ...(game ? { game } : {}), ...(action ? { action } : {}), page: String(p) })}`;

  return (
    <>
      <PageTitle sub="Every game action, newest first.">Audit log</PageTitle>
      <AdminNav current="/admin/audit" />

      <form method="get" action="/admin/audit" className="card mb-4 flex flex-wrap items-end gap-2 py-3">
        <div>
          <label className="label" htmlFor="game">Game</label>
          <select className="input" id="game" name="game" defaultValue={game}>
            <option value="">All games</option>
            <option value="none">Site-wide (accounts, registration)</option>
            {allGames.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="action">Action</label>
          <select className="input" id="action" name="action" defaultValue={action}>
            <option value="">Everything</option>
            {Object.entries(AUDIT_GROUPS).map(([group, label]) => (
              <optgroup key={group} label={label}>
                <option value={`${group}.`}>All {label.toLowerCase()} actions</option>
                {Object.entries(AUDIT_ACTIONS)
                  .filter(([k]) => k.startsWith(`${group}.`))
                  .map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button className="btn">Apply</button>
        {(game || action) && <Link href="/admin/audit" className="btn">Clear</Link>}
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-dim">Nothing logged{game || action ? " matches these filters" : " yet"}.</p>
        ) : (
          <table className="table text-sm">
            <thead>
              <tr><th>When</th><th>Game</th><th>What happened</th></tr>
            </thead>
            <tbody>
              {rows.map(({ log, actor, game, payload }) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap text-xs text-ink-dim">{fmtDate(log.createdAt)}</td>
                  <td className="text-xs text-ink-dim">{game ?? "—"}</td>
                  <td title={`${log.action} ${log.payloadJson === "{}" ? "" : log.payloadJson}`}>
                    {describeAudit({ action: log.action, payload, actor, actorUserId: log.actorUserId }, names)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        {page > 0 && <Link className="btn btn-sm" href={pageHref(page - 1)}>Newer</Link>}
        {rows.length === PAGE_SIZE && <Link className="btn btn-sm" href={pageHref(page + 1)}>Older</Link>}
      </div>
    </>
  );
}
