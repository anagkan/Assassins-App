import { randomInt } from "node:crypto";

/**
 * Pure helpers for the target ring. A ring maps each alive team id to the id of the
 * team it is hunting. A valid ring is a single cycle through every alive team.
 */
export type Ring = Map<number, number>;

/** Cryptographically random Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Build a ring by shuffling the ids and pointing each at the next. */
export function buildRing(ids: readonly number[]): Ring {
  if (ids.length < 2) throw new Error("A game needs at least 2 teams.");
  const order = shuffle(ids);
  const ring: Ring = new Map();
  order.forEach((id, i) => ring.set(id, order[(i + 1) % order.length]));
  return ring;
}

export function hunterOf(ring: Ring, id: number): number | undefined {
  for (const [hunter, target] of ring) if (target === id) return hunter;
  return undefined;
}

/**
 * Remove a team from the ring; its hunter inherits its target.
 * Returns the hunter id and the hunter's new target (equal to the hunter when it is the
 * last team standing).
 */
export function removeFromRing(ring: Ring, id: number): { hunterId: number; newTargetId: number } | null {
  const target = ring.get(id);
  if (target === undefined) return null;
  const hunter = hunterOf(ring, id);
  ring.delete(id);
  if (hunter === undefined || hunter === id) return null; // ring of one
  ring.set(hunter, target === id ? hunter : target);
  return { hunterId: hunter, newTargetId: ring.get(hunter)! };
}

/** Insert a team so that it hunts `beforeId`, taking over from beforeId's old hunter. */
export function insertIntoRing(ring: Ring, id: number, beforeId: number): void {
  if (ring.has(id)) throw new Error("Team is already in the ring.");
  const hunter = hunterOf(ring, beforeId);
  if (hunter === undefined) throw new Error("Insertion point is not in the ring.");
  ring.set(hunter, id);
  ring.set(id, beforeId);
}

/** Returns a list of problems; an empty list means the ring is a single valid cycle. */
export function validateRing(aliveIds: readonly number[], ring: Ring): string[] {
  const problems: string[] = [];
  const alive = new Set(aliveIds);
  if (alive.size === 0) return problems;
  if (alive.size === 1) {
    const only = aliveIds[0];
    const t = ring.get(only);
    if (t !== undefined && t !== only) problems.push(`Sole team ${only} targets ${t}.`);
    return problems;
  }
  for (const id of alive) {
    const t = ring.get(id);
    if (t === undefined) problems.push(`Team ${id} has no target.`);
    else if (!alive.has(t)) problems.push(`Team ${id} targets team ${t}, which is not alive.`);
    else if (t === id) problems.push(`Team ${id} targets itself.`);
  }
  for (const id of ring.keys()) if (!alive.has(id)) problems.push(`Non-alive team ${id} is in the ring.`);
  if (problems.length) return problems;

  const start = aliveIds[0];
  const seen = new Set<number>();
  let cur = start;
  do {
    seen.add(cur);
    cur = ring.get(cur)!;
  } while (cur !== start && !seen.has(cur));
  if (cur !== start || seen.size !== alive.size) {
    problems.push(`Ring is broken: the cycle from team ${start} covers ${seen.size} of ${alive.size} teams.`);
  }
  return problems;
}

/** Ring order starting at `start` (for the admin ring view). */
export function ringOrder(ring: Ring, start?: number): number[] {
  if (ring.size === 0) return [];
  const first = start ?? ring.keys().next().value!;
  const order: number[] = [];
  const seen = new Set<number>();
  let cur: number | undefined = first;
  while (cur !== undefined && !seen.has(cur)) {
    order.push(cur);
    seen.add(cur);
    cur = ring.get(cur);
  }
  return order;
}

/** Randomly split ids into groups of `size` (the last group may be smaller). */
export function groupIntoTeams<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("Team size must be at least 1.");
  const shuffled = shuffle(items);
  const groups: T[][] = [];
  for (let i = 0; i < shuffled.length; i += size) groups.push(shuffled.slice(i, i + size));
  return groups;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a team's inactivity window closes. While the game is paused the clock is frozen,
 * so the deadline slides forward by however long the current pause has lasted.
 */
export function inactivityDeadline(
  activityAt: number,
  inactivityDays: number,
  pausedAt: number | null,
  now: number,
): number {
  const base = activityAt + inactivityDays * DAY_MS;
  return pausedAt ? base + (now - pausedAt) : base;
}
