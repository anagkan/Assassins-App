import { desc, eq } from "drizzle-orm";
import { Empty, fmtDate } from "@/components/ui";
import { getDb } from "@/db";
import { announcements } from "@/db/schema";
import { announcementAction } from "../../../actions";
import { GameHeader, loadGame } from "../../../GameHeader";

export default async function AnnouncementsAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const game = loadGame(id);
  const rows = getDb().select().from(announcements).where(eq(announcements.gameId, game.id)).orderBy(desc(announcements.activeFrom)).all();
  const now = Date.now();

  return (
    <>
      <GameHeader id={id} current={`/admin/games/${game.id}/announcements`} sp={sp} />
      <div className="grid gap-4 md:grid-cols-2">
        <form action={announcementAction} className="card space-y-3 self-start">
          <h2 className="h-display text-xl">Post an immunity, rule or announcement</h2>
          <input type="hidden" name="gameId" value={game.id} />
          <input type="hidden" name="op" value="create" />
          <div>
            <label className="label" htmlFor="kind">Type</label>
            <select className="input" id="kind" name="kind" defaultValue="immunity">
              <option value="immunity">Immunity (e.g. &quot;safe while wearing a hat&quot;)</option>
              <option value="rule">Rule of the day (e.g. &quot;kills only count outdoors&quot;)</option>
              <option value="general">General announcement</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input className="input" id="title" name="title" required maxLength={200} placeholder="Immune if holding a rubber duck" />
          </div>
          <div>
            <label className="label" htmlFor="body">Details</label>
            <textarea className="input" id="body" name="body" rows={3} maxLength={2000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="activeFrom">Starts (blank = now)</label>
              <input className="input" id="activeFrom" name="activeFrom" type="datetime-local" />
            </div>
            <div>
              <label className="label" htmlFor="activeUntil">Ends (blank = never)</label>
              <input className="input" id="activeUntil" name="activeUntil" type="datetime-local" />
            </div>
          </div>
          <button className="btn btn-primary">Post</button>
        </form>

        <div className="space-y-2">
          {rows.length === 0 && <Empty>Nothing posted yet.</Empty>}
          {rows.map((a) => {
            const state = a.activeFrom > now ? "scheduled" : a.activeUntil && a.activeUntil <= now ? "expired" : "live";
            return (
              <div key={a.id} className={`card py-3 ${state === "expired" ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-dim">
                  <span>{a.kind}</span>
                  <span className={`pill ${state === "live" ? "chip-ok" : "chip-neutral"}`}>{state}</span>
                  <form action={announcementAction} className="ml-auto">
                    <input type="hidden" name="gameId" value={game.id} />
                    <input type="hidden" name="op" value="delete" />
                    <input type="hidden" name="announcementId" value={a.id} />
                    <button className="normal-case text-stop-ink underline">delete</button>
                  </form>
                </div>
                <div className="font-semibold">{a.title}</div>
                {a.body && <p className="whitespace-pre-line text-sm text-ink-dim">{a.body}</p>}
                <p className="mt-1 text-xs text-ink-dim">{fmtDate(a.activeFrom)} → {a.activeUntil ? fmtDate(a.activeUntil) : "no end"}</p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
