import { describe, expect, it } from "vitest";
import { cleanCode, inviteQuery, readInvite } from "@/lib/invite";

describe("share-link codes", () => {
  it("normalises codes and drops anything that isn't letters and digits", () => {
    expect(cleanCode(" abc123 ")).toBe("ABC123");
    expect(cleanCode("ABC/../x")).toBeUndefined();
    expect(cleanCode("https://evil.example")).toBeUndefined();
    expect(cleanCode("")).toBeUndefined();
    expect(cleanCode(["ABC"])).toBeUndefined();
    expect(cleanCode("A".repeat(21))).toBeUndefined();
  });

  it("reads from search params and form data alike", () => {
    expect(readInvite({ join: "abc", team: "<x>" })).toEqual({ join: "ABC", team: undefined });
    const fd = new FormData();
    fd.set("team", "xyz789");
    expect(readInvite(fd)).toEqual({ join: undefined, team: "XYZ789" });
  });

  it("builds a query string only when there's something to carry", () => {
    expect(inviteQuery({})).toBe("");
    expect(inviteQuery({ join: "ABC" })).toBe("?join=ABC");
    expect(inviteQuery({ join: "ABC", team: "XYZ" })).toBe("?join=ABC&team=XYZ");
  });
});
