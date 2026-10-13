import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditLog, participants, sessions, teams, users } from "@/db/schema";
import { createSession, createUser, deleteAccount, updateAccount, verifyLogin } from "@/lib/auth";
import * as G from "@/lib/game";
import { feed } from "@/lib/queries";
import { aliveMembers, aliveTeams, freshDb, killOne, makeUsers, setupGame } from "./helpers";

const student = { firstName: "Ada", lastName: "Lovelace", netId: "ab1234", puid: "012345678" };
const info = { username: "ada", firstName: "Ada", lastName: "Lovelace", netId: "ab1234", puid: "012345678" };
const userRow = (db: ReturnType<typeof freshDb>, id: number) => db.select().from(users).where(eq(users.id, id)).get();

describe("updateAccount", () => {
  it("updates the details, rebuilds the display name, and audits the changed fields", async () => {
    const db = freshDb();
    const [admin] = makeUsers(db, 1);
    const u = await createUser(db, { username: "ada", displayName: "Ada Lovelace", password: "password123", student });
    updateAccount(db, admin, u.id, { username: " Countess ", firstName: "Augusta", lastName: "King", netId: "CD5678", puid: "" });
    expect(userRow(db, u.id)).toMatchObject({ username: "countess", firstName: "Augusta", lastName: "King", displayName: "Augusta King", netId: "cd5678", puid: null });
    const entry = db.select().from(auditLog).where(eq(auditLog.action, "admin.update_user")).get()!;
    expect(JSON.parse(entry.payloadJson).changed).toEqual(["username", "firstName", "lastName", "displayName", "netId", "puid"]);
  });

  it("doesn't audit a save that changes nothing", async () => {
    const db = freshDb();
    const [admin] = makeUsers(db, 1);
    const u = await createUser(db, { username: "ada", displayName: "Ada Lovelace", password: "password123", student });
    updateAccount(db, admin, u.id, info);
    expect(db.select().from(auditLog).where(eq(auditLog.action, "admin.update_user")).all()).toHaveLength(0);
  });

  it("validates fields and rejects values another account has", async () => {
    const db = freshDb();
    const [admin] = makeUsers(db, 1);
    const u = await createUser(db, { username: "ada", displayName: "Ada Lovelace", password: "password123", student });
    await createUser(db, { username: "bob", displayName: "Bob B", password: "password123", student: { ...student, netId: "bb1111", puid: "111111111" } });
    expect(() => updateAccount(db, admin, u.id, { ...info, username: "x" })).toThrow(/Username/);
    expect(() => updateAccount(db, admin, u.id, { ...info, firstName: " " })).toThrow(/first name/);
    expect(() => updateAccount(db, admin, u.id, { ...info, netId: "abc" })).toThrow(/NetID/);
    expect(() => updateAccount(db, admin, u.id, { ...info, puid: "12" })).toThrow(/PUID/);
    expect(() => updateAccount(db, admin, u.id, { ...info, username: "BOB" })).toThrow(/taken/);
    expect(() => updateAccount(db, admin, u.id, { ...info, netId: "bb1111" })).toThrow(/NetID/);
    expect(() => updateAccount(db, admin, u.id, { ...info, puid: "111111111" })).toThrow(/PUID/);
  });
});

describe("deleteAccount", () => {
  it("removes an account with no game history, including its sessions", async () => {
    const db = freshDb();
    const [admin] = makeUsers(db, 1);
    const u = await createUser(db, { username: "ada", displayName: "Ada Lovelace", password: "password123", student });
    createSession(db, u.id);
    expect(await deleteAccount(db, admin, u.id)).toBe("deleted");
    expect(userRow(db, u.id)).toBeUndefined();
    expect(db.select().from(sessions).where(eq(sessions.userId, u.id)).all()).toHaveLength(0);
    // NetID and PUID are free again for the real student.
    await createUser(db, { username: "ada2", displayName: "Ada Lovelace", password: "password123", student });
  });

  it("drops registration sign-ups and the team they leave empty", async () => {
    const db = freshDb();
    const [admin] = makeUsers(db, 1);
    const { gameId, userIds } = setupGame(db, [1, 2]);
    const soloTeam = G.getParticipantForUser(db, gameId, userIds[0])!.teamId!;
    expect(await deleteAccount(db, admin, userIds[0])).toBe("deleted");
    expect(db.select().from(teams).where(eq(teams.id, soloTeam)).get()).toBeUndefined();
    expect(db.select().from(participants).where(eq(participants.gameId, gameId)).all()).toHaveLength(2);
  });

  it("refuses while they're alive in a running game", async () => {
    const db = freshDb();
    const [admin] = makeUsers(db, 1);
    const { gameId, userIds } = setupGame(db, [1, 1, 1]);
    G.startGame(db, admin, gameId);
    await expect(deleteAccount(db, admin, userIds[0])).rejects.toThrow(/still alive/);
    G.pauseGame(db, admin, gameId);
    await expect(deleteAccount(db, admin, userIds[0])).rejects.toThrow(/still alive/);
  });

  it("anonymizes someone who has played, keeping the kill feed intact", async () => {
    const db = freshDb();
    const [admin] = makeUsers(db, 1);
    const { gameId } = setupGame(db, [1, 1, 1]);
    G.startGame(db, admin, gameId);
    const hunter = aliveTeams(db, gameId)[0];
    const victim = aliveMembers(db, hunter.targetTeamId!)[0];
    killOne(db, gameId, hunter.id);
    db.update(users).set({ netId: "zz9999", puid: "999999999" }).where(eq(users.id, victim.userId)).run();
    createSession(db, victim.userId);

    expect(await deleteAccount(db, admin, victim.userId)).toBe("anonymized");
    const row = userRow(db, victim.userId)!;
    expect(row).toMatchObject({ displayName: "Deleted player", firstName: null, lastName: null, netId: null, puid: null, isAdmin: false });
    expect(row.username).toMatch(/^deleted-/);
    expect(await verifyLogin(db, row.username, "password123")).toBeNull();
    expect(db.select().from(sessions).where(eq(sessions.userId, victim.userId)).all()).toHaveLength(0);
    expect(feed(db, gameId).find((e) => e.kind === "kill")).toMatchObject({ victim: "Deleted player" });
  });

  it("won't delete your own account", async () => {
    const db = freshDb();
    const [admin] = makeUsers(db, 1);
    await expect(deleteAccount(db, admin, admin)).rejects.toThrow(/your own/);
  });
});

describe("runningGameFor", () => {
  it("is set only while a game they're in is active or paused", () => {
    const db = freshDb();
    const { gameId, userIds } = setupGame(db, [1, 1, 1]);
    const [outsider] = makeUsers(db, 1);
    expect(G.runningGameFor(db, userIds[0])).toBeUndefined();
    G.startGame(db, null, gameId);
    expect(G.runningGameFor(db, userIds[0])?.id).toBe(gameId);
    expect(G.runningGameFor(db, outsider)).toBeUndefined();
    G.pauseGame(db, null, gameId);
    expect(G.runningGameFor(db, userIds[0])?.id).toBe(gameId);
    G.finishGame(db, null, gameId, null);
    expect(G.runningGameFor(db, userIds[0])).toBeUndefined();
  });
});
