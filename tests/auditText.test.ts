import { describe, expect, it } from "vitest";
import { auditLog, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AUDIT_ACTIONS, auditNames, describeAudit, parsePayload } from "@/lib/auditText";
import * as G from "@/lib/game";
import { aliveMembers, aliveTeams, freshDb, killOne, makeUsers, setupGame } from "./helpers";

function sentences(db: ReturnType<typeof freshDb>) {
  const rows = db.select({ log: auditLog, actor: users.displayName }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorUserId)).orderBy(auditLog.id).all();
  const payloads = rows.map((r) => parsePayload(r.log.payloadJson));
  const names = auditNames(db, payloads);
  return rows.map((r, i) => ({ action: r.log.action, text: describeAudit({ action: r.log.action, payload: payloads[i], actor: r.actor, actorUserId: r.log.actorUserId }, names) }));
}

describe("audit log sentences", () => {
  it("has a label and a sentence for everything a game logs", () => {
    const db = freshDb();
    const { gameId, userIds } = setupGame(db, [2, 2, 1]);
    const [extra] = makeUsers(db, 1);
    G.joinGame(db, extra, gameId, G.getGame(db, gameId).joinCode);
    G.createTeam(db, gameId, extra, "Loners");
    G.leaveTeam(db, gameId, extra);
    G.leaveGame(db, gameId, extra);
    G.startGame(db, null, gameId);
    G.pauseGame(db, null, gameId);
    G.resumeGame(db, null, gameId);
    const hunter = aliveTeams(db, gameId)[0];
    const victim = aliveMembers(db, hunter.targetTeamId!)[0];
    const r = G.submitKill(db, gameId, aliveMembers(db, hunter.id)[0].userId, victim.id);
    G.rejectKill(db, userIds[0], r.id, "In a safe zone");
    killOne(db, gameId, hunter.id);
    for (const s of sentences(db)) {
      expect(AUDIT_ACTIONS[s.action], s.action).toBeDefined();
      expect(s.text, s.action).not.toMatch(/\{|undefined|NaN/);
    }
    const texts = sentences(db).map((s) => s.text);
    expect(texts).toContain("Player 0 left Loners."); // the team was deleted when it emptied
    expect(texts.some((t) => /^Player 0 rejected Player \d's report on Player \d \(reason: In a safe zone\)\.$/.test(t))).toBe(true);
    expect(texts.some((t) => /^System approved Player \d's kill on Player \d\.$/.test(t))).toBe(true);
  });

  it("says when a victim's confirmation approved the kill", () => {
    const db = freshDb();
    const { gameId } = setupGame(db, [1, 1, 1]);
    G.startGame(db, null, gameId);
    const hunter = aliveTeams(db, gameId)[0];
    const victim = aliveMembers(db, hunter.targetTeamId!)[0];
    const r = G.submitKill(db, gameId, aliveMembers(db, hunter.id)[0].userId, victim.id);
    G.respondToKill(db, victim.userId, r.id, "confirmed");
    const texts = sentences(db).map((s) => s.text);
    expect(texts.at(-2)).toMatch(/^Player \d confirmed Player \d's kill on them\.$/);
    expect(texts.at(-1)).toMatch(/^Player \d's kill on Player \d was approved automatically after Player \d confirmed it\.$/);
  });

  it("falls back to the raw action for unknown entries", () => {
    const names = auditNames(freshDb(), []);
    expect(describeAudit({ action: "x.y", payload: { a: 1 }, actor: "Ann", actorUserId: 1 }, names)).toBe('Ann: x.y {"a":1}');
    expect(describeAudit({ action: "kill.reject", payload: { reportId: 9 }, actor: null, actorUserId: null }, names)).toBe("System rejected report #9.");
  });
});
