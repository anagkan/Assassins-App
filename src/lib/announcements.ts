import { and, eq, gte } from "drizzle-orm";
import type { DB } from "@/db";
import { ANNOUNCEMENT_KINDS, announcements, type Announcement } from "@/db/schema";
import { GameError, audit, getGame } from "./game";

export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export interface AnnouncementInput {
  kind: string;
  title: string;
  body: string;
  activeFrom: number | null; // null = now
  activeUntil: number | null; // null = never ends
}

/** Post on each of these weekdays (0 = Sunday) up to and including the day `until` falls on. */
export interface Repeat {
  weekdays: number[];
  until: number;
}

export const MAX_REPEATS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function clean(input: AnnouncementInput) {
  const kind = input.kind as AnnouncementKind;
  if (!ANNOUNCEMENT_KINDS.includes(kind)) throw new GameError("Invalid type.");
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new GameError("Title is required.");
  const activeFrom = input.activeFrom ?? Date.now();
  const activeUntil = input.activeUntil;
  if (activeUntil != null && activeUntil <= activeFrom) throw new GameError("End must be after start.");
  return { kind, title, body: input.body.slice(0, 2000), activeFrom, activeUntil };
}

/**
 * The start/end times of each copy of a repeating announcement. Copies keep the first one's
 * wall-clock times (so they don't drift an hour across daylight saving), and land only on
 * the ticked weekdays from the first day through `repeat.until`'s day.
 */
export function repeatTimes(activeFrom: number, activeUntil: number | null, repeat: Repeat): [number, number][] {
  if (activeUntil == null) throw new GameError("A repeating announcement needs an end time.");
  if (activeUntil - activeFrom > DAY_MS) throw new GameError("A repeating announcement must end within 24 hours of starting.");
  const last = new Date(repeat.until);
  last.setHours(23, 59, 59, 999);
  if (last.getTime() < activeFrom) throw new GameError("Repeat-until date is before the start.");
  const days = new Set(repeat.weekdays);
  const out: [number, number][] = [];
  for (let k = 0; ; k++) {
    const from = new Date(activeFrom);
    from.setDate(from.getDate() + k);
    if (from.getTime() > last.getTime()) break;
    if (!days.has(from.getDay())) continue;
    const until = new Date(activeUntil);
    until.setDate(until.getDate() + k);
    out.push([from.getTime(), until.getTime()]);
    if (out.length > MAX_REPEATS) throw new GameError(`That's more than ${MAX_REPEATS} repeats. Pick an earlier end date.`);
  }
  if (!out.length) throw new GameError("None of the ticked days fall between the start and the repeat-until date.");
  return out;
}

function getAnnouncement(db: DB, gameId: number, id: number): Announcement {
  const a = db.select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.gameId, gameId))).get();
  if (!a) throw new GameError("Announcement not found.");
  return a;
}

/** Post an announcement, or a series of copies when `repeat` has weekdays ticked. Returns how many were posted. */
export function createAnnouncement(db: DB, actorId: number | null, gameId: number, input: AnnouncementInput, repeat?: Repeat): number {
  getGame(db, gameId);
  const a = clean(input);
  const times: [number, number | null][] = repeat?.weekdays.length ? repeatTimes(a.activeFrom, a.activeUntil, repeat) : [[a.activeFrom, a.activeUntil]];
  return db.transaction((tx) => {
    let seriesId: number | null = null;
    for (const [activeFrom, activeUntil] of times) {
      const row = tx
        .insert(announcements)
        .values({ ...a, gameId, activeFrom, activeUntil, seriesId, createdBy: actorId, createdAt: Date.now() })
        .returning()
        .get();
      if (times.length > 1 && seriesId == null) {
        seriesId = row.id;
        tx.update(announcements).set({ seriesId }).where(eq(announcements.id, row.id)).run();
      }
    }
    audit(tx, actorId, gameId, "announcement.create", { kind: a.kind, title: a.title, ...(times.length > 1 ? { copies: times.length } : {}) });
    return times.length;
  });
}

/** Edit one announcement. In a series, only this copy changes. */
export function updateAnnouncement(db: DB, actorId: number | null, gameId: number, id: number, input: AnnouncementInput) {
  const old = getAnnouncement(db, gameId, id);
  const a = clean({ ...input, activeFrom: input.activeFrom ?? old.activeFrom });
  db.update(announcements).set(a).where(eq(announcements.id, id)).run();
  audit(db, actorId, gameId, "announcement.update", { id, title: a.title });
}

/** Delete one announcement, or with `andLater`, it and every later copy in its series. Returns how many went. */
export function deleteAnnouncement(db: DB, actorId: number | null, gameId: number, id: number, andLater = false): number {
  const a = getAnnouncement(db, gameId, id);
  const where =
    andLater && a.seriesId != null
      ? and(eq(announcements.gameId, gameId), eq(announcements.seriesId, a.seriesId), gte(announcements.activeFrom, a.activeFrom))
      : eq(announcements.id, id);
  const n = db.delete(announcements).where(where).run().changes;
  audit(db, actorId, gameId, "announcement.delete", { id, title: a.title, ...(n > 1 ? { copies: n } : {}) });
  return n;
}

/** Format a timestamp for a datetime-local input, in the server's time zone (the same one the action parses with). */
export function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
