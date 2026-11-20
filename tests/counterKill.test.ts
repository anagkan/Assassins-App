import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditLog, killReports, participants, teams, users } from "@/db/schema";
import * as G from "@/lib/game";
import { dashboard } from "@/lib/queries";
import { DAY_MS } from "@/lib/ring";
import { aliveMembers, aliveTeams, assertRingValid, freshDb, gameRow, setupGame } from "./helpers";

type DB = ReturnType<typeof freshDb>;

const nameOf = (db: DB, participantId: number) =>
  db
    .select({ n: users.displayName })
    .from(participants)
    .innerJoin(users, eq(users.id, participants.userId))
    .where(eq(participants.id, participantId))
    .get()!.n;
const team = (db: DB, id: number) => db.select().from(teams).where(eq(teams.id, id)).get()!;
const player = (db: DB, id: number) => db.select().from(participants).where(eq(participants.id, id)).get()!;
const report = (db: DB, id: number) => db.select().from(killReports).where(eq(killReports.id, id)).get()!;

/** A started game with counter-kills on, from the point of view of `me`, the first member of some team. */
function setup(teamSizes = [1, 1, 1, 1], counterKills = true) {
  const db = freshDb();
  const { gameId } = setupGame(db, teamSizes, { counterKills });
  G.startGame(db, null, gameId);
  const myTeam = aliveTeams(db, gameId)[0];
  const me = aliveMembers(db, myTeam.id)[0];
  const hunterTeam = aliveTeams(db, gameId).find((t) => t.targetTeamId === myTeam.id)!;
  const hunter = aliveMembers(db, hunterTeam.id)[0];
  return { db, gameId, myTeam, me, hunterTeam, hunter };
}

describe("counter-kills", () => {
  it("are off unless the admin turns them on", () => {
    const { db, gameId, me, hunter } = setup([1, 1, 1], false);
    expect(() => G.submitCounterKill(db, gameId, me.userId, nameOf(db, hunter.id))).toThrow(/isn't allowed/);
    G.updateGameSettings(db, null, gameId, { counterKills: true });
    expect(G.submitCounterKill(db, gameId, me.userId, nameOf(db, hunter.id)).victimId).toBe(hunter.id);
  });

  it("naming the hunter sends the normal kill report, which the hunter can confirm", () => {
    const { db, gameId, myTeam, me, hunterTeam, hunter } = setup();
    // Case and spacing don't matter.
    const typed = `  ${nameOf(db, hunter.id).toUpperCase().replace(" ", "   ")} `;
    const r = G.submitCounterKill(db, gameId, me.userId, typed, { location: "Library" });
    expect(r).toMatchObject({ assassinId: me.id, victimId: hunter.id, counterKill: true, status: "pending", location: "Library" });
    expect(G.reportProblem(db, r.id)).toBeNull();

    // The hunter sees it as a claim against them.
    const theirs = dashboard(db, gameRow(db, gameId), hunter.userId);
    expect(theirs.me && theirs.againstMe.map((x) => x.id)).toEqual([r.id]);

    const grandHunter = aliveTeams(db, gameId).find((t) => t.targetTeamId === hunterTeam.id)!;
    expect(G.respondToKill(db, hunter.userId, r.id, "confirmed")).toEqual({ stale: false });
    expect(player(db, hunter.id).status).toBe("eliminated");
    expect(player(db, hunter.id).eliminatedById).toBe(me.id);
    expect(player(db, me.id).kills).toBe(1);
    expect(team(db, myTeam.id).kills).toBe(1);
    // The hunter's hunter now hunts me; my own target is unchanged.
    expect(team(db, grandHunter.id).targetTeamId).toBe(myTeam.id);
    expect(team(db, hunterTeam.id).status).toBe("eliminated");
    expect(team(db, hunterTeam.id).eliminatedByTeamId).toBe(myTeam.id);
    assertRingValid(db, gameId);
  });

  it("works on any alive member of the hunting team", () => {
    const { db, gameId, me, hunterTeam } = setup([2, 2, 2]);
    const [first, second] = aliveMembers(db, hunterTeam.id);
    const r = G.submitCounterKill(db, gameId, me.userId, nameOf(db, second.id));
    G.approveKill(db, 1, r.id);
    expect(player(db, second.id).status).toBe("eliminated");
    expect(team(db, hunterTeam.id).status).toBe("alive");
    expect(player(db, first.id).status).toBe("alive");
    assertRingValid(db, gameId);
  });

  it("naming someone else sends nothing, is logged, and locks the form after three misses a day", () => {
    const { db, gameId, myTeam, me, hunter } = setup([1, 1, 1, 1, 1]);
    const bystanders = aliveTeams(db, gameId).filter((t) => t.id !== myTeam.id && t.targetTeamId !== myTeam.id && t.id !== myTeam.targetTeamId);
    const wrong = nameOf(db, aliveMembers(db, bystanders[0].id)[0].id);

    expect(() => G.submitCounterKill(db, gameId, me.userId, wrong)).toThrow(/isn't hunting you.*2 more players/);
    expect(() => G.submitCounterKill(db, gameId, me.userId, wrong)).toThrow(/1 more player who isn't/);
    expect(() => G.submitCounterKill(db, gameId, me.userId, wrong)).toThrow(/last wrong name/);
    expect(db.select().from(killReports).all()).toHaveLength(0);
    const misses = db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "kill.counter_miss"), eq(auditLog.actorUserId, me.userId)))
      .all();
    expect(misses).toHaveLength(3);

    // Locked out, even for the right name...
    expect(() => G.submitCounterKill(db, gameId, me.userId, nameOf(db, hunter.id))).toThrow(/in the last 24 hours/);
    // ...until the misses are a day old.
    expect(G.submitCounterKill(db, gameId, me.userId, nameOf(db, hunter.id), {}, Date.now() + DAY_MS + 1).victimId).toBe(hunter.id);
  });

  it("typos, players already out and your own target don't count as misses", () => {
    const { db, gameId, myTeam, me } = setup([1, 1, 1, 1]);
    const target = aliveMembers(db, myTeam.targetTeamId!)[0];
    expect(() => G.submitCounterKill(db, gameId, me.userId, "Nobody Here")).toThrow(/Nobody in this game/);
    expect(() => G.submitCounterKill(db, gameId, me.userId, "   ")).toThrow(/Type the full name/);
    expect(() => G.submitCounterKill(db, gameId, me.userId, nameOf(db, target.id))).toThrow(/is your target/);
    G.removePlayer(db, null, target.id);
    expect(() => G.submitCounterKill(db, gameId, me.userId, nameOf(db, target.id))).toThrow(/already out/);
    expect(db.select().from(auditLog).where(eq(auditLog.action, "kill.counter_miss")).all()).toHaveLength(0);
  });

  it("with two teams left, the target is also the hunter", () => {
    const { db, gameId, me, hunter } = setup([1, 1]);
    const r = G.submitCounterKill(db, gameId, me.userId, nameOf(db, hunter.id));
    G.approveKill(db, 1, r.id);
    expect(gameRow(db, gameId).status).toBe("finished");
    expect(gameRow(db, gameId).winnerTeamId).toBe(me.teamId);
  });

  it("only alive players in an active game can report, once per victim", () => {
    const { db, gameId, me, hunter, hunterTeam } = setup();
    const name = nameOf(db, hunter.id);
    G.pauseGame(db, null, gameId);
    expect(() => G.submitCounterKill(db, gameId, me.userId, name)).toThrow(/while the game is active/);
    G.resumeGame(db, null, gameId);

    // The hunter's own hunter got there first and reported it.
    const grandHunter = aliveTeams(db, gameId).find((t) => t.targetTeamId === hunterTeam.id)!;
    G.submitKill(db, gameId, aliveMembers(db, grandHunter.id)[0].userId, hunter.id);
    expect(() => G.submitCounterKill(db, gameId, me.userId, name)).toThrow(/already waiting/);
  });

  it("goes stale if the victim's team stops hunting the assassin's team", () => {
    const { db, gameId, me, hunter } = setup();
    const r = G.submitCounterKill(db, gameId, me.userId, nameOf(db, hunter.id));
    db.update(teams).set({ targetTeamId: null }).where(eq(teams.id, hunter.teamId!)).run();
    expect(G.reportProblem(db, r.id)).toMatch(/no longer hunting/);
    expect(G.approveKill(db, 1, r.id)).toEqual({ stale: true });
    expect(player(db, hunter.id).status).toBe("alive");
  });

  it("undoing one puts the hunting team back in front of the killer's team", () => {
    const { db, gameId, myTeam, me, hunterTeam, hunter } = setup();
    const r = G.submitCounterKill(db, gameId, me.userId, nameOf(db, hunter.id));
    G.approveKill(db, 1, r.id);
    G.undoKill(db, 1, r.id);
    expect(player(db, hunter.id).status).toBe("alive");
    expect(player(db, me.id).kills).toBe(0);
    expect(team(db, hunterTeam.id).targetTeamId).toBe(myTeam.id);
    expect(report(db, r.id).status).toBe("rejected");
    assertRingValid(db, gameId);
  });

  it("is copied when a game is copied", () => {
    const { db, gameId } = setup();
    expect(G.createGame(db, null, "Next", gameId).counterKills).toBe(true);
  });
});

describe("nameKey", () => {
  it("ignores case, spacing and curly apostrophes", () => {
    expect(G.nameKey("  Seán  O’Brien ")).toBe(G.nameKey("seán o'brien"));
    expect(G.nameKey("Ann Lee")).not.toBe(G.nameKey("Anne Lee"));
  });
});
