import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { PageTitle, fmtDate } from "@/components/ui";
import { getDb } from "@/db";
import { auditLog, games, users } from "@/db/schema";
import { AdminNav } from "../AdminNav";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(0, Number((await searchParams).page ?? 0) || 0);
  const rows = getDb()
    .select({ log: auditLog, actor: users.displayName, game: games.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .leftJoin(games, eq(games.id, auditLog.gameId))
    .orderBy(desc(auditLog.id))
    .limit(100)
    .offset(page * 100)
    .all();
  return (
    <>
      <PageTitle sub="Every game action, newest first.">Audit log</PageTitle>
      <AdminNav current="/admin/audit" />
      <div className="card overflow-x-auto">
        <table className="table text-xs">
          <thead>
            <tr><th>When</th><th>Who</th><th>Game</th><th>Action</th><th>Details</th></tr>
          </thead>
          <tbody>
            {rows.map(({ log, actor, game }) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap text-muted">{fmtDate(log.createdAt)}</td>
                <td>{actor ?? "system"}</td>
                <td className="text-muted">{game ?? "—"}</td>
                <td className="font-mono">{log.action}</td>
                <td className="max-w-xs break-all font-mono text-muted">{log.payloadJson === "{}" ? "" : log.payloadJson}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        {page > 0 && <Link className="btn btn-sm" href={`/admin/audit?page=${page - 1}`}>Newer</Link>}
        {rows.length === 100 && <Link className="btn btn-sm" href={`/admin/audit?page=${page + 1}`}>Older</Link>}
      </div>
    </>
  );
}
