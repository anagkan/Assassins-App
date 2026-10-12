import { describe, expect, it } from "vitest";
import { createUser, normalizeStudentInfo } from "@/lib/auth";
import { freshDb } from "./helpers";

const student = { firstName: " Ada ", lastName: "Lovelace", netId: "AB1234", puid: "012345678" };

describe("student info", () => {
  it("normalizes valid input", () => {
    expect(normalizeStudentInfo(student)).toEqual({ firstName: "Ada", lastName: "Lovelace", netId: "ab1234", puid: "012345678" });
  });

  it.each(["a12345", "abc123", "ab123", "ab12345", "1b1234", "ab12c4"])("rejects NetID %s", (netId) => {
    expect(() => normalizeStudentInfo({ ...student, netId })).toThrow(/NetID/);
  });

  it.each(["12345678", "1234567890", "12345678a", "1234 5678"])("rejects PUID %s", (puid) => {
    expect(() => normalizeStudentInfo({ ...student, puid })).toThrow(/PUID/);
  });

  it("requires first and last name", () => {
    expect(() => normalizeStudentInfo({ ...student, lastName: "  " })).toThrow(/name/);
  });

  it("rejects duplicate NetID and PUID", async () => {
    const db = freshDb();
    await createUser(db, { username: "ada", displayName: "Ada Lovelace", password: "password123", student });
    await expect(
      createUser(db, { username: "ada2", displayName: "x", password: "password123", student: { ...student, netId: "ab1234", puid: "999999999" } }),
    ).rejects.toThrow(/NetID/);
    await expect(
      createUser(db, { username: "ada3", displayName: "x", password: "password123", student: { ...student, netId: "cd5678" } }),
    ).rejects.toThrow(/PUID/);
  });

  it("allows multiple accounts without student info", async () => {
    const db = freshDb();
    await createUser(db, { username: "admin1", displayName: "A", password: "password123" });
    await createUser(db, { username: "admin2", displayName: "B", password: "password123" });
  });
});
