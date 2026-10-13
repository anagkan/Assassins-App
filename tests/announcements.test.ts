import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { announcements } from "@/db/schema";
import * as A from "@/lib/announcements";
import * as G from "@/lib/game";
import { freshDb } from "./helpers";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const input = (from: number, until: number | null): A.AnnouncementInput => ({ kind: "immunity", title: "Goggles", body: "", activeFrom: from, activeUntil: until });

function setup() {
  const db = freshDb();
  const gameId = G.createGame(db, null, "Test").id;
  const rows = () => db.select().from(announcements).where(eq(announcements.gameId, gameId)).orderBy(announcements.activeFrom).all();
  return { db, gameId, rows };
}

describe("repeating announcements", () => {
  it("lands on the ticked weekdays only, keeping the wall-clock times", () => {
    // Mon 12 Oct 2026, 8am–8pm, Mon/Wed through Sun 25 Oct.
    const times = A.repeatTimes(at(2026, 10, 12, 8), at(2026, 10, 12, 20), { weekdays: [1, 3], until: at(2026, 10, 25) });
    expect(times.map(([f]) => new Date(f).getDate())).toEqual([12, 14, 19, 21]);
    for (const [f, u] of times) {
      expect(new Date(f).getHours()).toBe(8);
      expect(new Date(u).getHours()).toBe(20);
    }
  });

  it("includes the repeat-until day and windows that cross midnight", () => {
    const times = A.repeatTimes(at(2026, 10, 12, 22), at(2026, 10, 13, 2), { weekdays: [0, 1, 2, 3, 4, 5, 6], until: at(2026, 10, 14) });
    expect(times).toHaveLength(3);
    expect(new Date(times[2][1]).getDate()).toBe(15);
  });

  it("refuses open-ended, over-long or empty series", () => {
    const repeat = { weekdays: [1], until: at(2026, 10, 30) };
    expect(() => A.repeatTimes(at(2026, 10, 12, 8), null, repeat)).toThrow(/end time/);
    expect(() => A.repeatTimes(at(2026, 10, 12, 8), at(2026, 10, 14, 8), repeat)).toThrow(/24 hours/);
    expect(() => A.repeatTimes(at(2026, 10, 13, 8), at(2026, 10, 13, 9), { weekdays: [1], until: at(2026, 10, 18) })).toThrow(/None of the ticked days/);
    expect(() => A.repeatTimes(at(2026, 10, 12, 8), at(2026, 10, 12, 9), { weekdays: [1], until: at(2026, 10, 1) })).toThrow(/before the start/);
  });

  it("posts a series that can be deleted from a given day onwards", () => {
    const { db, gameId, rows } = setup();
    const n = A.createAnnouncement(db, null, gameId, input(at(2026, 10, 12, 8), at(2026, 10, 12, 20)), { weekdays: [1, 2, 3], until: at(2026, 10, 21) });
    expect(n).toBe(6);
    const all = rows();
    expect(new Set(all.map((a) => a.seriesId))).toEqual(new Set([all[0].id]));
    expect(A.deleteAnnouncement(db, null, gameId, all[3].id, true)).toBe(3);
    expect(rows().map((a) => a.id)).toEqual(all.slice(0, 3).map((a) => a.id));
  });
});

describe("editing announcements", () => {
  it("updates one copy and keeps its start when the field is left blank", () => {
    const { db, gameId, rows } = setup();
    A.createAnnouncement(db, null, gameId, input(at(2026, 10, 12, 8), at(2026, 10, 12, 20)));
    const [a] = rows();
    A.updateAnnouncement(db, null, gameId, a.id, { ...input(0, at(2026, 10, 12, 18)), activeFrom: null, title: "Hats" });
    const [b] = rows();
    expect(b).toMatchObject({ title: "Hats", activeFrom: a.activeFrom, activeUntil: at(2026, 10, 12, 18), seriesId: null });
    expect(() => A.updateAnnouncement(db, null, gameId, a.id, input(at(2026, 10, 12, 8), at(2026, 10, 12, 7)))).toThrow(/after start/);
    expect(() => A.updateAnnouncement(db, null, gameId + 1, a.id, input(at(2026, 10, 12, 8), null))).toThrow(/not found/);
  });
});

describe("datetime-local round trip", () => {
  it("formats in local time", () => {
    expect(A.toLocalInput(at(2026, 3, 8, 9, 5))).toBe("2026-03-08T09:05");
    expect(new Date(A.toLocalInput(at(2026, 3, 8, 9, 5))).getTime()).toBe(at(2026, 3, 8, 9, 5));
  });
});
