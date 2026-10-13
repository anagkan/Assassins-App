import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { killReports, participants, teams } from "@/db/schema";
import { DEFAULT_RULES, DEFAULT_SAFE_ZONES } from "@/lib/defaults";
import * as G from "@/lib/game";
import { DAY_MS } from "@/lib/ring";
import { aliveMembers, aliveTeams, assertRingValid, freshDb, gameRow, killOne, makeUsers, setupGame } from "./helpers";

function playToWinner(teamSizes: number[]) {
  const db = freshDb();
  const { gameId } = setupGame(db, teamSizes);
  G.startGame(db, null, gameId);
  assertRingValid(db, gameId);
  const totalPlayers = teamSizes.reduce((a, b) => a + b, 0);
  let kills = 0;
  while (gameRow(db, gameId).status === "active") {
    const hunter = aliveTeams(db, gameId)[0];
    const res = killOne(db, gameId, hunter.id);
    expect(res.stale).toBe(false);
    kills++;
    if (gameRow(db, gameId).status === "active") assertRingValid(db, gameId);
    expect(kills).toBeLessThanOrEqual(totalPlayers);
  }
  const g = gameRow(db, gameId);
  expect(g.status).toBe("finished");
  const alive = aliveTeams(db, gameId);
  expect(alive).toHaveLength(1);
  expect(g.winnerTeamId).toBe(alive[0].id);
  return { db, gameId };
}

describe("full games", () => {
  it("solo players (teams of 1)", () => playToWinner([1, 1, 1, 1, 1, 1, 1, 1]));
  it("even teams of 3", () => playToWinner([3, 3, 3, 3]));
  it("uneven teams (1/2/5)", () => playToWinner([1, 2, 5]));
  it("two teams", () => playToWinner([2, 4]));
});

describe("game setup", () => {
  it("saves the template rules on a new game so players see them", () => {
    const db = freshDb();
    const g = G.createGame(db, null, "Fresh");
    expect(g.rulesMarkdown).toBe(DEFAULT_RULES);
    expect(g.safeZonesMarkdown).toBe(DEFAULT_SAFE_ZONES);
  });

  it("copies rules from an earlier game", () => {
    const db = freshDb();
    const old = G.createGame(db, null, "Old");
    G.updateGameSettings(db, null, old.id, { rulesMarkdown: "Custom", safeZonesMarkdown: "Library" });
    const g = G.createGame(db, null, "New", old.id);
    expect(g.rulesMarkdown).toBe("Custom");
    expect(g.safeZonesMarkdown).toBe("Library");
  });
});

describe("team mechanics", () => {
  it("killing part of a team does not move the ring; wiping it does", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [2, 2, 2]);
    G.startGame(db, null, gameId);
    const hunter = aliveTeams(db, gameId)[0];
    const targetId = hunter.targetTeamId!;
    const nextTarget = db.select().from(teams).where(eq(teams.id, targetId)).get()!.targetTeamId;

    killOne(db, gameId, hunter.id);
    expect(db.select().from(teams).where(eq(teams.id, hunter.id)).get()!.targetTeamId).toBe(targetId);
    expect(aliveMembers(db, targetId)).toHaveLength(1);

    killOne(db, gameId, hunter.id);
    const t = db.select().from(teams).where(eq(teams.id, targetId)).get()!;
    expect(t.status).toBe("eliminated");
    expect(t.eliminatedByTeamId).toBe(hunter.id);
    expect(db.select().from(teams).where(eq(teams.id, hunter.id)).get()!.targetTeamId).toBe(nextTarget);
    expect(db.select().from(teams).where(eq(teams.id, hunter.id)).get()!.kills).toBe(2);
    assertRingValid(db, gameId);
  });

  it("enforces max team size and blocks starting with unassigned players", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [2, 2], { maxTeamSize: 2 });
    const g = G.getGame(db, gameId);
    const [newUser] = makeUsers(db, 1);
    G.joinGame(db, newUser, gameId, g.joinCode);
    const team = db.select().from(teams).where(eq(teams.gameId, gameId)).get()!;
    expect(() => G.joinTeam(db, gameId, newUser, team.inviteCode)).toThrow(/at most 2/);
    expect(() => G.startGame(db, null, gameId)).toThrow(/aren't on a team/);
  });

  it("enforces min team size at start", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 3, 3], { minTeamSize: 2 });
    expect(() => G.startGame(db, null, gameId)).toThrow(/minimum is 2/);
  });

  it("auto-fill tops up teams then forms new ones", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1], { maxTeamSize: 3 });
    const code = G.getGame(db, gameId).joinCode;
    for (const u of makeUsers(db, 7)) G.joinGame(db, u, gameId, code);
    expect(G.autoFillTeams(db, 0, gameId, 3)).toBe(7);
    const ps = db.select().from(participants).where(eq(participants.gameId, gameId)).all();
    expect(ps.every((p) => p.teamId != null)).toBe(true);
    const counts = new Map<number, number>();
    for (const p of ps) counts.set(p.teamId!, (counts.get(p.teamId!) ?? 0) + 1);
    expect([...counts.values()].sort()).toEqual([2, 3, 3]);
    G.startGame(db, null, gameId);
    assertRingValid(db, gameId);
  });

  it("closing sign-ups blocks new joins but not team changes", () => {
    const db = freshDb();
    const { gameId, userIds } = setupGame(db, [1, 1]);
    const code = G.getGame(db, gameId).joinCode;
    G.setSignupsOpen(db, null, gameId, false);
    const [late] = makeUsers(db, 1);
    expect(() => G.joinGame(db, late, gameId, code)).toThrow(/closed/);
    G.leaveTeam(db, gameId, userIds[0]);
    G.createTeam(db, gameId, userIds[0], "Renamed");
    G.setSignupsOpen(db, null, gameId, true);
    G.joinGame(db, late, gameId, code);
    G.createTeam(db, gameId, late, "Late");
    G.startGame(db, null, gameId);
    expect(() => G.setSignupsOpen(db, null, gameId, true)).toThrow();
  });

  it("merge and move players during registration", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 1, 2]);
    const [a, b] = db.select().from(teams).where(eq(teams.gameId, gameId)).all();
    G.mergeTeams(db, 0, a.id, b.id);
    expect(db.select().from(teams).where(eq(teams.gameId, gameId)).all()).toHaveLength(2);
    const p = db.select().from(participants).where(eq(participants.teamId, b.id)).get()!;
    G.movePlayer(db, 0, p.id, "new");
    expect(db.select().from(teams).where(eq(teams.gameId, gameId)).all()).toHaveLength(3);
  });
});

describe("reports", () => {
  it("only allows kills on the current target team", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 1, 1]);
    G.startGame(db, null, gameId);
    const [t1] = aliveTeams(db, gameId);
    const me = aliveMembers(db, t1.id)[0];
    const notTarget = aliveTeams(db, gameId).find((t) => t.id !== t1.id && t.id !== t1.targetTeamId)!;
    expect(() => G.submitKill(db, gameId, me.userId, aliveMembers(db, notTarget.id)[0].id)).toThrow(/target team/);
  });

  it("blocks duplicate pending reports and marks stale ones", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 2, 1]);
    G.startGame(db, null, gameId);
    const teamsNow = aliveTeams(db, gameId);
    const big = teamsNow.find((t) => aliveMembers(db, t.id).length === 2)!;
    const hunter = teamsNow.find((t) => t.targetTeamId === big.id)!;
    const victim = aliveMembers(db, big.id)[0];
    const me = aliveMembers(db, hunter.id)[0];
    const r1 = G.submitKill(db, gameId, me.userId, victim.id);
    expect(() => G.submitKill(db, gameId, me.userId, victim.id)).toThrow(/already waiting/);
    // Admin removes the victim's whole team before approving: report becomes stale.
    G.removeTeam(db, 0, big.id);
    expect(db.select().from(killReports).where(eq(killReports.id, r1.id)).get()!.status).toBe("stale");
    assertRingValid(db, gameId);
  });

  it("approving an outdated report marks it stale instead of killing", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 1, 1, 1]);
    G.startGame(db, null, gameId);
    const [t1] = aliveTeams(db, gameId);
    const me = aliveMembers(db, t1.id)[0];
    const victim = aliveMembers(db, t1.targetTeamId!)[0];
    const r = G.submitKill(db, gameId, me.userId, victim.id);
    G.reshuffleAlive(db, 0, gameId); // stales pending reports
    expect(() => G.approveKill(db, 0, r.id)).toThrow(/already stale/);
    assertRingValid(db, gameId);
  });

  it("rejecting leaves everyone alive", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 1, 1]);
    G.startGame(db, null, gameId);
    const [t1] = aliveTeams(db, gameId);
    const r = G.submitKill(db, gameId, aliveMembers(db, t1.id)[0].userId, aliveMembers(db, t1.targetTeamId!)[0].id);
    G.rejectKill(db, 0, r.id, "witnessed in dining hall");
    expect(aliveTeams(db, gameId)).toHaveLength(3);
  });
});

describe("admin corrections", () => {
  it("removing a player mid-ring keeps the ring valid", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 2, 1, 1]);
    G.startGame(db, null, gameId);
    const solo = aliveTeams(db, gameId).find((t) => aliveMembers(db, t.id).length === 1)!;
    const hunter = aliveTeams(db, gameId).find((t) => t.targetTeamId === solo.id)!;
    G.removePlayer(db, 0, aliveMembers(db, solo.id)[0].id, "dropped out");
    expect(db.select().from(teams).where(eq(teams.id, solo.id)).get()!.status).toBe("purged");
    expect(db.select().from(teams).where(eq(teams.id, hunter.id)).get()!.targetTeamId).toBe(solo.targetTeamId);
    assertRingValid(db, gameId);
  });

  it("revives a player on a living team without touching the ring", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [2, 2, 2]);
    G.startGame(db, null, gameId);
    const hunter = aliveTeams(db, gameId)[0];
    const target = hunter.targetTeamId!;
    killOne(db, gameId, hunter.id);
    const dead = db.select().from(participants).where(eq(participants.status, "eliminated")).get()!;
    G.reviveParticipant(db, 0, dead.id);
    expect(aliveMembers(db, target)).toHaveLength(2);
    expect(db.select().from(teams).where(eq(teams.id, hunter.id)).get()!.kills).toBe(0);
    assertRingValid(db, gameId);
  });

  it("revives a wiped team back into the ring, even after the game ended", () => {
    const { db, gameId } = playToWinner([1, 1]);
    const dead = db.select().from(participants).where(eq(participants.status, "eliminated")).get()!;
    G.reviveParticipant(db, 0, dead.id);
    expect(gameRow(db, gameId).status).toBe("active");
    expect(aliveTeams(db, gameId)).toHaveLength(2);
    assertRingValid(db, gameId);
  });

  it("revives a team before a chosen team", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 1, 1, 1]);
    G.startGame(db, null, gameId);
    const hunter = aliveTeams(db, gameId)[0];
    const victimTeam = hunter.targetTeamId!;
    killOne(db, gameId, hunter.id);
    const before = aliveTeams(db, gameId).find((t) => t.id !== hunter.id)!.id;
    const p = db.select().from(participants).where(eq(participants.teamId, victimTeam)).get()!;
    G.reviveParticipant(db, 0, p.id, before);
    expect(db.select().from(teams).where(eq(teams.id, victimTeam)).get()!.targetTeamId).toBe(before);
    assertRingValid(db, gameId);
  });

  it("reshuffle keeps a valid ring", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 3, 2, 1, 1]);
    G.startGame(db, null, gameId);
    for (let i = 0; i < 10; i++) {
      G.reshuffleAlive(db, 0, gameId);
      assertRingValid(db, gameId);
    }
  });

  it("finishing manually stales pending reports", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 1, 1]);
    G.startGame(db, null, gameId);
    const [t1] = aliveTeams(db, gameId);
    const r = G.submitKill(db, gameId, aliveMembers(db, t1.id)[0].userId, aliveMembers(db, t1.targetTeamId!)[0].id);
    G.finishGame(db, 0, gameId, t1.id);
    expect(db.select().from(killReports).where(eq(killReports.id, r.id)).get()!.status).toBe("stale");
    expect(gameRow(db, gameId).winnerTeamId).toBe(t1.id);
  });
});

describe("inactivity", () => {
  it("flags teams with no kills past the deadline, excluding paused time", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 1, 1, 1], { inactivityDays: 2 });
    G.startGame(db, null, gameId);
    const start = gameRow(db, gameId).startedAt!;
    expect(G.getInactiveTeams(db, gameId, start + DAY_MS)).toHaveLength(0);
    expect(G.getInactiveTeams(db, gameId, start + 2 * DAY_MS + 1)).toHaveLength(4);

    // Pause for 3 days after day 1: nobody is inactive at day 4.
    G.pauseGame(db, 0, gameId, start + DAY_MS);
    expect(G.getInactiveTeams(db, gameId, start + 3 * DAY_MS)).toHaveLength(0);
    G.resumeGame(db, 0, gameId, start + 4 * DAY_MS);
    expect(G.getInactiveTeams(db, gameId, start + 4.5 * DAY_MS)).toHaveLength(0);
    expect(G.getInactiveTeams(db, gameId, start + 5 * DAY_MS + 1)).toHaveLength(4);
  });

  it("a kill resets the team's window and purge only removes previewed inactive teams", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 1, 1, 1, 1], { inactivityDays: 1 });
    G.startGame(db, null, gameId);
    const hunter = aliveTeams(db, gameId)[0];
    killOne(db, gameId, hunter.id);
    const now = Date.now();
    const later = now + DAY_MS - 1000;
    db.update(teams).set({ activityAt: now - 2 * DAY_MS }).where(eq(teams.gameId, gameId)).run();
    db.update(teams).set({ activityAt: now }).where(eq(teams.id, hunter.id)).run();
    const inactive = G.getInactiveTeams(db, gameId, later).map((x) => x.team.id);
    expect(inactive).not.toContain(hunter.id);
    expect(inactive).toHaveLength(3);
    const purged = G.purgeInactive(db, 0, gameId, [...inactive, hunter.id], later);
    expect(purged).toBe(3);
    expect(gameRow(db, gameId).status).toBe("finished");
    expect(gameRow(db, gameId).winnerTeamId).toBe(hunter.id);
  });
});

describe("victim responses", () => {
  function pendingKill(teamSizes = [2, 2, 2]) {
    const db = freshDb();
    const { gameId } = setupGame(db, teamSizes);
    G.startGame(db, null, gameId);
    const hunter = aliveTeams(db, gameId)[0];
    const assassin = aliveMembers(db, hunter.id)[0];
    const victim = aliveMembers(db, hunter.targetTeamId!)[0];
    const report = G.submitKill(db, gameId, assassin.userId, victim.id);
    return { db, gameId, hunter, assassin, victim, report };
  }
  const reportRow = (db: ReturnType<typeof freshDb>, id: number) => db.select().from(killReports).where(eq(killReports.id, id)).get()!;

  it("confirming approves the kill with no admin and leaves it unseen", () => {
    const { db, gameId, hunter, assassin, victim, report } = pendingKill();
    expect(G.respondToKill(db, victim.userId, report.id, "confirmed")).toEqual({ stale: false });
    const r = reportRow(db, report.id);
    expect(r.status).toBe("approved");
    expect(r.victimResponse).toBe("confirmed");
    expect(r.reviewedBy).toBeNull();
    expect(r.adminSeenAt).toBeNull();
    expect(db.select().from(participants).where(eq(participants.id, victim.id)).get()!.status).toBe("eliminated");
    expect(db.select().from(participants).where(eq(participants.id, assassin.id)).get()!.kills).toBe(1);
    expect(db.select().from(teams).where(eq(teams.id, hunter.id)).get()!.kills).toBe(1);

    G.acknowledgeConfirmedKills(db, 1, gameId, report.id);
    expect(reportRow(db, report.id).adminSeenAt).not.toBeNull();
  });

  it("confirming the last member wipes the team and moves the ring", () => {
    const { db, gameId, hunter, victim, report } = pendingKill([1, 1, 1]);
    const next = db.select().from(teams).where(eq(teams.id, hunter.targetTeamId!)).get()!.targetTeamId;
    G.respondToKill(db, victim.userId, report.id, "confirmed");
    expect(db.select().from(teams).where(eq(teams.id, hunter.id)).get()!.targetTeamId).toBe(next);
    assertRingValid(db, gameId);
  });

  it("disputing keeps the report pending with the victim's note, and needs a note", () => {
    const { db, victim, report } = pendingKill();
    expect(() => G.respondToKill(db, victim.userId, report.id, "disputed", "  ")).toThrow(/what really happened/);
    G.respondToKill(db, victim.userId, report.id, "disputed", "I was in the dining hall");
    const r = reportRow(db, report.id);
    expect(r.status).toBe("pending");
    expect(r.victimNote).toBe("I was in the dining hall");
    expect(() => G.respondToKill(db, victim.userId, report.id, "confirmed")).toThrow(/already disputed/);
    expect(G.approveKill(db, 1, report.id)).toEqual({ stale: false });
  });

  it("only the victim can respond", () => {
    const { db, assassin, report } = pendingKill();
    expect(() => G.respondToKill(db, assassin.userId, report.id, "confirmed")).toThrow(/not found/);
    expect(reportRow(db, report.id).status).toBe("pending");
  });

  it("confirming an out-of-date report marks it stale instead of approving", () => {
    const { db, assassin, victim, report } = pendingKill();
    db.update(participants).set({ status: "eliminated" }).where(eq(participants.id, assassin.id)).run();
    expect(G.respondToKill(db, victim.userId, report.id, "confirmed")).toEqual({ stale: true });
    expect(reportRow(db, report.id).status).toBe("stale");
    expect(db.select().from(participants).where(eq(participants.id, victim.id)).get()!.status).toBe("alive");
  });
});
