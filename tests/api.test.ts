import { describe, expect, it } from "vitest";
import { auditLog } from "@/db/schema";
import * as API from "@/lib/api";
import * as G from "@/lib/game";
import { freshDb } from "./helpers";

const TOKEN = "t".repeat(API.MIN_TOKEN_LENGTH);
const HOUR = 60 * 60 * 1000;

function setup() {
  const db = freshDb();
  const gameId = G.createGame(db, null, "Test").id;
  return { db, gameId };
}

describe("API auth", () => {
  it("accepts only the configured bearer token", () => {
    expect(API.authorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(API.authorized(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(API.authorized(TOKEN, TOKEN)).toBe(false);
    expect(API.authorized(null, TOKEN)).toBe(false);
  });

  it("is off when the token is unset or too short", () => {
    expect(API.authorized("Bearer ", undefined)).toBe(false);
    expect(API.authorized("Bearer ", "")).toBe(false);
    expect(API.authorized("Bearer short", "short")).toBe(false);
  });
});

describe("parseTime", () => {
  it("reads epoch ms, ISO times and bare dates as local midnight", () => {
    expect(API.parseTime(1234, "t")).toBe(1234);
    expect(API.parseTime("2026-10-30T12:00:00Z", "t")).toBe(Date.UTC(2026, 9, 30, 12));
    expect(API.parseTime("2026-10-30", "t")).toBe(new Date(2026, 9, 30).getTime());
    expect(API.parseTime(null, "t")).toBeNull();
    expect(API.parseTime(undefined, "t")).toBeUndefined();
    expect(() => API.parseTime("soon", "t")).toThrow(/ISO 8601/);
  });
});

describe("announcements API", () => {
  it("posts, lists, patches and deletes", () => {
    const { db, gameId } = setup();
    const now = Date.now();
    const res = API.postAnnouncement(db, gameId, { kind: "immunity", title: "Goggles", activeUntil: now + HOUR });
    expect(res.posted).toBe(1);
    const a = res.announcements[0];
    expect(a).toMatchObject({ kind: "immunity", title: "Goggles", body: "", active: true });

    const patched = API.patchAnnouncement(db, gameId, a.id, { body: "Swim goggles on your head", activeUntil: null });
    expect(patched.announcement).toMatchObject({ title: "Goggles", body: "Swim goggles on your head", activeUntil: null });

    expect(API.listAnnouncements(db, gameId).announcements.map((x) => x.id)).toEqual([a.id]);
    expect(API.removeAnnouncement(db, gameId, a.id, false)).toEqual({ deleted: 1 });
    expect(API.listAnnouncements(db, gameId, true).announcements).toEqual([]);
    expect(db.select().from(auditLog).all().map((r) => r.action)).toEqual(
      expect.arrayContaining(["announcement.create", "announcement.update", "announcement.delete"]),
    );
  });

  it("defaults to a general announcement and hides ended ones unless asked", () => {
    const { db, gameId } = setup();
    const now = Date.now();
    API.postAnnouncement(db, gameId, { title: "Old", activeFrom: now - 2 * HOUR, activeUntil: now - HOUR });
    const [cur] = API.postAnnouncement(db, gameId, { title: "Item drop at Firestone" }).announcements;
    expect(cur.kind).toBe("general");
    expect(API.listAnnouncements(db, gameId).announcements.map((x) => x.title)).toEqual(["Item drop at Firestone"]);
    expect(API.listAnnouncements(db, gameId, true).announcements).toHaveLength(2);
  });

  it("posts a repeating series and returns every copy", () => {
    const { db, gameId } = setup();
    const res = API.postAnnouncement(db, gameId, {
      kind: "immunity",
      title: "Hat",
      activeFrom: "2026-11-02T08:00",
      activeUntil: "2026-11-02T20:00",
      repeat: { weekdays: [1, 3], until: "2026-11-11" },
    });
    expect(res.posted).toBe(4);
    expect(res.announcements.map((a) => new Date(a.activeFrom!).getDate())).toEqual([2, 4, 9, 11]);
    expect(new Set(res.announcements.map((a) => a.seriesId)).size).toBe(1);
  });

  it("rejects bad input and other games' announcements", () => {
    const { db, gameId } = setup();
    const other = G.createGame(db, null, "Other").id;
    expect(() => API.postAnnouncement(db, gameId, [])).toThrow(/JSON object/);
    expect(() => API.postAnnouncement(db, gameId, { title: 5 })).toThrow(/"title" must be a string/);
    expect(() => API.postAnnouncement(db, gameId, { title: "x", kind: "item" })).toThrow(/Invalid type/);
    expect(() => API.postAnnouncement(db, gameId, { title: "x", repeat: { weekdays: [7], until: "2026-11-11" } })).toThrow(/weekday/);
    const [a] = API.postAnnouncement(db, gameId, { title: "Mine" }).announcements;
    expect(() => API.patchAnnouncement(db, other, a.id, { title: "Theirs" })).toThrow(/not found/);
    expect(() => API.listAnnouncements(db, 999)).toThrow(/Game not found/);
  });
});

describe("safe zones API", () => {
  it("replaces the safe-zone markdown and leaves other settings alone", () => {
    const { db, gameId } = setup();
    const before = G.getGame(db, gameId);
    expect(API.putSafeZones(db, gameId, { markdown: "- Dining halls\n- Firestone" })).toEqual({ markdown: "- Dining halls\n- Firestone" });
    const after = G.getGame(db, gameId);
    expect(after.rulesMarkdown).toBe(before.rulesMarkdown);
    expect(after.name).toBe(before.name);
    expect(() => API.putSafeZones(db, gameId, {})).toThrow(/"markdown" is required/);
  });
});

describe("listGames", () => {
  it("points at the current game", () => {
    const { db, gameId } = setup();
    G.openRegistration(db, null, gameId);
    expect(API.listGames(db)).toMatchObject({ currentGameId: gameId, games: [{ id: gameId, status: "registration" }] });
  });
});
