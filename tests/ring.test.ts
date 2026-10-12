import { describe, expect, it } from "vitest";
import { buildRing, groupIntoTeams, inactivityDeadline, insertIntoRing, removeFromRing, ringOrder, validateRing, DAY_MS } from "@/lib/ring";

describe("ring helpers", () => {
  it("builds a single cycle over every id", () => {
    for (let n = 2; n < 30; n++) {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      const ring = buildRing(ids);
      expect(validateRing(ids, ring)).toEqual([]);
      expect(ringOrder(ring)).toHaveLength(n);
    }
  });

  it("never pairs two teams against each other when there are 3+ teams", () => {
    for (let n = 3; n < 30; n++) {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      for (let trial = 0; trial < 20; trial++) {
        const ring = buildRing(ids);
        for (const [hunter, target] of ring) expect(ring.get(target)).not.toBe(hunter);
      }
    }
  });

  it("assigns targets randomly", () => {
    const ids = [1, 2, 3, 4, 5];
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(ringOrder(buildRing(ids), 1).join(","));
    // 5 teams form (5-1)! = 24 distinct cycles; all of them should turn up.
    expect(seen.size).toBe(24);
  });

  it("refuses fewer than 2 teams", () => {
    expect(() => buildRing([1])).toThrow();
  });

  it("removal hands the target to the hunter", () => {
    const ring = new Map([[1, 2], [2, 3], [3, 1]]);
    expect(removeFromRing(ring, 2)).toEqual({ hunterId: 1, newTargetId: 3 });
    expect(validateRing([1, 3], ring)).toEqual([]);
    expect(removeFromRing(ring, 3)).toEqual({ hunterId: 1, newTargetId: 1 });
  });

  it("insertion splices a team in before another", () => {
    const ring = new Map([[1, 2], [2, 3], [3, 1]]);
    insertIntoRing(ring, 4, 2);
    expect(ring.get(1)).toBe(4);
    expect(ring.get(4)).toBe(2);
    expect(validateRing([1, 2, 3, 4], ring)).toEqual([]);
  });

  it("detects broken rings", () => {
    expect(validateRing([1, 2, 3, 4], new Map([[1, 2], [2, 1], [3, 4], [4, 3]]))).not.toEqual([]);
    expect(validateRing([1, 2], new Map([[1, 2]]))).not.toEqual([]);
    expect(validateRing([1, 2], new Map([[1, 2], [2, 9]]))).not.toEqual([]);
  });

  it("groups into teams of a size", () => {
    const groups = groupIntoTeams([1, 2, 3, 4, 5, 6, 7], 3);
    expect(groups.map((g) => g.length)).toEqual([3, 3, 1]);
    expect(groups.flat().sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("freezes inactivity deadlines while paused", () => {
    expect(inactivityDeadline(0, 2, null, 5)).toBe(2 * DAY_MS);
    expect(inactivityDeadline(0, 2, 1000, 1000 + DAY_MS)).toBe(3 * DAY_MS);
  });
});
