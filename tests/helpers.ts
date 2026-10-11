import { and, eq } from "drizzle-orm";
import { expect } from "vitest";
import { openDb, type DB } from "@/db";
import { games, participants, teams, users } from "@/db/schema";
import * as G from "@/lib/game";

export function freshDb(): DB {
  return openDb(":memory:");
}

export function makeUsers(db: DB, n: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    db.insert(users).values({ username: `u${i}_${Math.random()}`, displayName: `Player ${i}`, passwordHash: "x", createdAt: Date.now() }).returning().get().id,
  );
}

/** Create a game in registration with teams of the given sizes. Returns ids. */
export function setupGame(db: DB, teamSizes: number[], opts: Partial<G.GameSettings> = {}) {
  const game = G.createGame(db, null, "Test");
  G.updateGameSettings(db, null, game.id, { maxTeamSize: null, ...opts });
  G.openRegistration(db, null, game.id);
  const code = G.getGame(db, game.id).joinCode;
  const userIds = makeUsers(db, teamSizes.reduce((a, b) => a + b, 0));
  let i = 0;
  for (const size of teamSizes) {
    const captain = userIds[i++];
    G.joinGame(db, captain, game.id, code);
    const team = G.createTeam(db, game.id, captain, `T${size}-${i}`);
    for (let k = 1; k < size; k++) {
      const u = userIds[i++];
      G.joinGame(db, u, game.id, code);
      G.joinTeam(db, game.id, u, team.inviteCode);
    }
  }
  return { gameId: game.id, userIds };
}

export function aliveTeams(db: DB, gameId: number) {
  return db.select().from(teams).where(and(eq(teams.gameId, gameId), eq(teams.status, "alive"))).all();
}

export function aliveMembers(db: DB, teamId: number) {
  return db.select().from(participants).where(and(eq(participants.teamId, teamId), eq(participants.status, "alive"))).all();
}

export function gameRow(db: DB, gameId: number) {
  return db.select().from(games).where(eq(games.id, gameId)).get()!;
}

export function assertRingValid(db: DB, gameId: number) {
  expect(G.checkRing(db, gameId)).toEqual([]);
}

/** Have some alive member of `hunterTeam` kill one alive member of its target; approve it. */
export function killOne(db: DB, gameId: number, hunterTeamId: number) {
  const hunter = db.select().from(teams).where(eq(teams.id, hunterTeamId)).get()!;
  const assassin = aliveMembers(db, hunter.id)[0];
  const victim = aliveMembers(db, hunter.targetTeamId!)[0];
  const r = G.submitKill(db, gameId, assassin.userId, victim.id);
  return G.approveKill(db, null, r.id);
}
