import { createHash, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { DB } from "@/db";
import { announcements, games, type Announcement } from "@/db/schema";
import * as A from "./announcements";
import { GameError, getCurrentGame, getGame, updateGameSettings } from "./game";

// A JSON API for scripts and agents: announcements (daily immunities, items, news) and the
// safe-zone list. It's off unless AGENT_API_TOKEN is set, and every request must send
// `Authorization: Bearer <token>`. Changes go through the same functions as the admin pages,
// so they're validated the same way and show up in the audit log as "System".

export const MIN_TOKEN_LENGTH = 32;

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Whether `header` carries the configured token. A missing or too-short token disables the API. */
export function authorized(header: string | null, token = process.env.AGENT_API_TOKEN): boolean {
  if (!token || token.length < MIN_TOKEN_LENGTH || !header?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(header.slice(7).trim()), digest(token));
}

type Json = Record<string, unknown>;

function asObject(v: unknown): Json {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new GameError("Request body must be a JSON object.");
  return v as Json;
}

function optString(o: Json, key: string): string | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new GameError(`"${key}" must be a string.`);
  return v;
}

/**
 * A time from JSON: epoch milliseconds, an ISO 8601 string, or a bare date ("2026-10-30"),
 * which means midnight in the server's time zone. Times without an offset are also read in
 * the server's zone, as the admin forms do. null stays null; a missing key stays undefined.
 */
export function parseTime(v: unknown, key: string): number | null | undefined {
  if (v === undefined || v === null) return v;
  let t = NaN;
  if (typeof v === "number") t = v;
  else if (typeof v === "string") t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00` : v).getTime();
  if (!Number.isFinite(t)) throw new GameError(`"${key}" must be an ISO 8601 time or epoch milliseconds.`);
  return t;
}

function parseRepeat(v: unknown): A.Repeat | undefined {
  if (v === undefined || v === null) return undefined;
  const o = asObject(v);
  const weekdays = o.weekdays;
  if (!Array.isArray(weekdays) || !weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    throw new GameError('"repeat.weekdays" must be a list of weekday numbers, 0 (Sunday) to 6 (Saturday).');
  }
  const until = parseTime(o.until, "repeat.until");
  if (until == null) throw new GameError('"repeat.until" is required.');
  return { weekdays: [...new Set(weekdays as number[])], until };
}

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

export function announcementJson(a: Announcement, now = Date.now()) {
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    body: a.body,
    activeFrom: iso(a.activeFrom),
    activeUntil: iso(a.activeUntil),
    active: a.activeFrom <= now && (a.activeUntil == null || a.activeUntil > now),
    seriesId: a.seriesId,
  };
}

export function listGames(db: DB) {
  const current = getCurrentGame(db)?.id ?? null;
  const rows = db.select({ id: games.id, name: games.name, status: games.status }).from(games).orderBy(desc(games.id)).all();
  return { currentGameId: current, games: rows };
}

/** Announcements that haven't ended yet, or every one with `all`, oldest start first. */
export function listAnnouncements(db: DB, gameId: number, all = false) {
  getGame(db, gameId);
  const now = Date.now();
  const where = all
    ? eq(announcements.gameId, gameId)
    : and(eq(announcements.gameId, gameId), or(isNull(announcements.activeUntil), gt(announcements.activeUntil, now)));
  const rows = db.select().from(announcements).where(where).orderBy(asc(announcements.activeFrom), asc(announcements.id)).all();
  return { announcements: rows.map((a) => announcementJson(a, now)) };
}

/** Post one announcement, or a series when `repeat` is given. Returns what was posted. */
export function postAnnouncement(db: DB, gameId: number, body: unknown) {
  const o = asObject(body);
  const input: A.AnnouncementInput = {
    kind: optString(o, "kind") ?? "general",
    title: optString(o, "title") ?? "",
    body: optString(o, "body") ?? "",
    activeFrom: parseTime(o.activeFrom, "activeFrom") ?? null,
    activeUntil: parseTime(o.activeUntil, "activeUntil") ?? null,
  };
  const n = A.createAnnouncement(db, null, gameId, input, parseRepeat(o.repeat));
  const rows = db.select().from(announcements).where(eq(announcements.gameId, gameId)).orderBy(desc(announcements.id)).limit(n).all();
  return { posted: n, announcements: rows.reverse().map((a) => announcementJson(a)) };
}

function getOwn(db: DB, gameId: number, id: number): Announcement {
  const a = db.select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.gameId, gameId))).get();
  if (!a) throw new GameError("Announcement not found.");
  return a;
}

/** Change only the fields present in `body`. `"activeUntil": null` makes it never end. */
export function patchAnnouncement(db: DB, gameId: number, id: number, body: unknown) {
  const o = asObject(body);
  const old = getOwn(db, gameId, id);
  const until = parseTime(o.activeUntil, "activeUntil");
  A.updateAnnouncement(db, null, gameId, id, {
    kind: optString(o, "kind") ?? old.kind,
    title: optString(o, "title") ?? old.title,
    body: optString(o, "body") ?? old.body,
    activeFrom: parseTime(o.activeFrom, "activeFrom") ?? old.activeFrom,
    activeUntil: until === undefined ? old.activeUntil : until,
  });
  return { announcement: announcementJson(getOwn(db, gameId, id)) };
}

export function removeAnnouncement(db: DB, gameId: number, id: number, andLater: boolean) {
  return { deleted: A.deleteAnnouncement(db, null, gameId, id, andLater) };
}

export function getSafeZones(db: DB, gameId: number) {
  return { markdown: getGame(db, gameId).safeZonesMarkdown };
}

/** Replace the whole safe-zone list. */
export function putSafeZones(db: DB, gameId: number, body: unknown) {
  const markdown = optString(asObject(body), "markdown");
  if (markdown === undefined) throw new GameError('"markdown" is required.');
  updateGameSettings(db, null, gameId, { safeZonesMarkdown: markdown });
  return getSafeZones(db, gameId);
}
