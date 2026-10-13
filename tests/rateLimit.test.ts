import { describe, expect, it } from "vitest";
import { clear, hit, isLimited, rateLimit } from "@/lib/rateLimit";

describe("rate limiter", () => {
  it("allows `limit` events per window, then blocks", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("only limits after `limit` hits, and checking doesn't count", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 10; i++) expect(isLimited(key, 2)).toBe(false);
    hit(key, 60_000);
    expect(isLimited(key, 2)).toBe(false);
    hit(key, 60_000);
    expect(isLimited(key, 2)).toBe(true);
  });

  it("clear resets a key", () => {
    const key = `t:${Math.random()}`;
    hit(key, 60_000);
    hit(key, 60_000);
    clear(key);
    expect(isLimited(key, 2)).toBe(false);
  });

  it("forgets hits once the window passes", () => {
    const key = `t:${Math.random()}`;
    hit(key, -1);
    expect(isLimited(key, 1)).toBe(false);
  });
});
