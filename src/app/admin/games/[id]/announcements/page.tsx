import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Empty, fmtDate } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { getDb } from "@/db";
import { announcements } from "@/db/schema";
import { toLocalInput } from "@/lib/announcements";
import { announcementAction } from "../../../actions";
import { GameHeader, gameMetadata, loadGame } from "../../../GameHeader";

const WEEKDAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
] as const;

export const generateMetadata = gameMetadata("Announcements");

export default async function AnnouncementsAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; edit?: string; copy?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const game = loadGame(id);
  const rows = getDb().select().from(announcements).where(eq(announcements.gameId, game.id)).orderBy(desc(announcements.activeFrom)).all();
  const now = Date.now();
  const base = `/admin/games/${game.id}/announcements`;
  // ?edit=<id> edits that announcement in place; ?copy=<id> prefills a new one from it.
  const editing = rows.find((a) => String(a.id) === sp.edit);
  const source = editing ?? rows.find((a) => String(a.id) === sp.copy);

  return (
    <>
      <GameHeader id={id} current={base} sp={sp} />
      <div className="grid gap-4 md:grid-cols-2">
        <form key={`${editing ? "edit" : "new"}-${source?.id ?? ""}`} action={announcementAction} className="card space-y-3 self-start">
          <h2 className="h-display text-xl">{editing ? "Edit announcement" : source ? "Post a copy" : "Post an immunity, rule or announcement"}</h2>
          <input type="hidden" name="gameId" value={game.id} />
          <input type="hidden" name="op" value={editing ? "update" : "create"} />
          {editing && <input type="hidden" name="announcementId" value={editing.id} />}
          {editing?.seriesId != null && <p className="text-xs text-ink-dim">This is one day of a repeating announcement. Changes apply to this day only.</p>}
          <div>
            <label className="label" htmlFor="kind">Type</label>
            <select className="input" id="kind" name="kind" defaultValue={source?.kind ?? "immunity"}>
              <option value="immunity">Immunity (e.g. &quot;safe while wearing a hat&quot;)</option>
              <option value="rule">Rule of the day (e.g. &quot;kills only count outdoors&quot;)</option>
              <option value="general">General announcement</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input className="input" id="title" name="title" required maxLength={200} placeholder="Immune if holding a rubber duck" defaultValue={source?.title} />
          </div>
          <div>
            <label className="label" htmlFor="body">Details</label>
            <textarea className="input" id="body" name="body" rows={3} maxLength={2000} defaultValue={source?.body} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="activeFrom">Starts{editing ? "" : " (blank = now)"}</label>
              <input className="input" id="activeFrom" name="activeFrom" type="datetime-local" defaultValue={toLocalInput(source?.activeFrom ?? null)} />
            </div>
            <div>
              <label className="label" htmlFor="activeUntil">Ends (blank = never)</label>
              <input className="input" id="activeUntil" name="activeUntil" type="datetime-local" defaultValue={toLocalInput(source?.activeUntil ?? null)} />
            </div>
          </div>
          {!editing && (
            <fieldset className="rounded-md border border-line p-3">
              <legend className="label px-1">Repeat (optional)</legend>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {WEEKDAYS.map(([d, label]) => (
                  <label key={d} className="flex items-center gap-1">
                    <input type="checkbox" name="repeatDay" value={d} /> {label}
                  </label>
                ))}
              </div>
              <div className="mt-2">
                <label className="label" htmlFor="repeatUntil">Until (inclusive)</label>
                <input className="input" id="repeatUntil" name="repeatUntil" type="date" />
              </div>
              <p className="mt-1 text-xs text-ink-dim">
                Posts a copy on each ticked day, at the same start and end times, from the start date through this one. Needs an end time within 24 hours of the start.
              </p>
            </fieldset>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary">{editing ? "Save changes" : "Post"}</button>
            {source && <Link href={base} className="btn">Cancel</Link>}
          </div>
        </form>

        <div className="space-y-2">
          {rows.length === 0 && <Empty>Nothing posted yet.</Empty>}
          {rows.map((a) => {
            const state = a.activeFrom > now ? "scheduled" : a.activeUntil && a.activeUntil <= now ? "expired" : "live";
            const hasLater = a.seriesId != null && rows.some((b) => b.id !== a.id && b.seriesId === a.seriesId && b.activeFrom > a.activeFrom);
            return (
              <div key={a.id} className={`card py-3 ${state === "expired" ? "opacity-60" : ""} ${a.id === editing?.id ? "border-accent" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-ink-dim">
                  <span>{a.kind}</span>
                  <span className={`pill ${state === "live" ? "chip-ok" : "chip-neutral"}`}>{state}</span>
                  {a.seriesId != null && <span className="pill chip-info">repeats</span>}
                  <span className="ml-auto flex gap-3 normal-case">
                    <Link href={`${base}?edit=${a.id}`} className="underline">edit</Link>
                    <Link href={`${base}?copy=${a.id}`} className="underline">duplicate</Link>
                    <form action={announcementAction}>
                      <input type="hidden" name="gameId" value={game.id} />
                      <input type="hidden" name="announcementId" value={a.id} />
                      <button name="op" value="delete" className="text-stop-ink underline">delete</button>
                      {hasLater && (
                        <ConfirmButton name="op" value="deleteLater" className="ml-3 text-stop-ink underline" message={`Delete "${a.title}" on this day and every later repeat?`}>
                          delete this &amp; later
                        </ConfirmButton>
                      )}
                    </form>
                  </span>
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
