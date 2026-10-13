import { randomInt } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { DB } from "@/db";
import {
  auditLog,
  games,
  killReports,
  participants,
  teams,
  users,
  type Game,
  type Participant,
  type Team,
  type VictimResponse,
} from "@/db/schema";
import {
  buildRing,
  groupIntoTeams,
  inactivityDeadline,
  insertIntoRing,
  removeFromRing,
  shuffle,
  validateRing,
  type Ring,
} from "./ring";

/** An error whose message is safe to show to the user. */
export class GameError extends Error {}

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Conn = DB | Tx;

const now = () => Date.now();

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function randomCode(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function audit(c: Conn, actorUserId: number | null, gameId: number | null, action: string, payload: object = {}) {
  c.insert(auditLog)
    .values({ actorUserId, gameId, action, payloadJson: JSON.stringify(payload), createdAt: now() })
    .run();
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getGame(c: Conn, gameId: number): Game {
  const g = c.select().from(games).where(eq(games.id, gameId)).get();
  if (!g) throw new GameError("Game not found.");
  return g;
}

/** The game players should see: the newest unfinished non-draft game, else the newest finished one. */
export function getCurrentGame(c: Conn): Game | undefined {
  const live = c
    .select()
    .from(games)
    .where(inArray(games.status, ["registration", "active", "paused"]))
    .orderBy(desc(games.id))
    .get();
  if (live) return live;
  return c.select().from(games).where(eq(games.status, "finished")).orderBy(desc(games.id)).get();
}

export function getParticipantForUser(c: Conn, gameId: number, userId: number): Participant | undefined {
  return c
    .select()
    .from(participants)
    .where(and(eq(participants.gameId, gameId), eq(participants.userId, userId)))
    .get();
}

function getParticipant(c: Conn, participantId: number): Participant {
  const p = c.select().from(participants).where(eq(participants.id, participantId)).get();
  if (!p) throw new GameError("Player not found.");
  return p;
}

function getTeam(c: Conn, teamId: number): Team {
  const t = c.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!t) throw new GameError("Team not found.");
  return t;
}

function displayNameOf(c: Conn, userId: number): string {
  return c.select({ n: users.displayName }).from(users).where(eq(users.id, userId)).get()?.n ?? "Player";
}

function teamMembers(c: Conn, teamId: number): Participant[] {
  return c.select().from(participants).where(eq(participants.teamId, teamId)).all();
}

function aliveCount(c: Conn, teamId: number): number {
  return teamMembers(c, teamId).filter((p) => p.status === "alive").length;
}

function loadRing(c: Conn, gameId: number): Ring {
  const alive = c
    .select()
    .from(teams)
    .where(and(eq(teams.gameId, gameId), eq(teams.status, "alive")))
    .all();
  const ring: Ring = new Map();
  for (const t of alive) if (t.targetTeamId != null) ring.set(t.id, t.targetTeamId);
  return ring;
}

function saveRing(c: Conn, gameId: number, ring: Ring) {
  const all = c.select({ id: teams.id, targetTeamId: teams.targetTeamId }).from(teams).where(eq(teams.gameId, gameId)).all();
  for (const t of all) {
    const target = ring.get(t.id) ?? null;
    if (t.targetTeamId !== target) c.update(teams).set({ targetTeamId: target }).where(eq(teams.id, t.id)).run();
  }
}

function requireStatus(game: Game, ...allowed: Game["status"][]) {
  if (!allowed.includes(game.status)) {
    throw new GameError(`This can't be done while the game is ${game.status}.`);
  }
}

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

export interface GameSettings {
  name?: string;
  maxTeamSize?: number | null;
  minTeamSize?: number;
  rulesMarkdown?: string;
  safeZonesMarkdown?: string;
  inactivityDays?: number | null;
  showKillerInFeed?: boolean;
}

export function createGame(db: DB, actorId: number | null, name: string, copyFromGameId?: number): Game {
  return db.transaction((tx) => {
    const src = copyFromGameId ? getGame(tx, copyFromGameId) : undefined;
    const game = tx
      .insert(games)
      .values({
        name: name.trim() || "New game",
        joinCode: randomCode(6),
        createdAt: now(),
        maxTeamSize: src?.maxTeamSize ?? 1,
        minTeamSize: src?.minTeamSize ?? 1,
        rulesMarkdown: src?.rulesMarkdown ?? "",
        safeZonesMarkdown: src?.safeZonesMarkdown ?? "",
        inactivityDays: src?.inactivityDays ?? null,
        showKillerInFeed: src?.showKillerInFeed ?? true,
      })
      .returning()
      .get();
    audit(tx, actorId, game.id, "game.create", { name: game.name, copyFromGameId });
    return game;
  });
}

export function updateGameSettings(db: DB, actorId: number | null, gameId: number, s: GameSettings) {
  db.transaction((tx) => {
    const game = getGame(tx, gameId);
    if (s.maxTeamSize != null && s.maxTeamSize < 1) throw new GameError("Max team size must be at least 1.");
    if (s.minTeamSize != null && s.minTeamSize < 1) throw new GameError("Min team size must be at least 1.");
    const max = s.maxTeamSize === undefined ? game.maxTeamSize : s.maxTeamSize;
    const min = s.minTeamSize ?? game.minTeamSize;
    if (max != null && min > max) throw new GameError("Min team size can't exceed max team size.");
    if (s.inactivityDays != null && s.inactivityDays < 1) throw new GameError("Inactivity days must be at least 1.");
    if (game.status === "active" || game.status === "paused") {
      if (s.maxTeamSize !== undefined && s.maxTeamSize !== game.maxTeamSize) {
        throw new GameError("Team sizes can't change after the game has started.");
      }
      if (s.minTeamSize !== undefined && s.minTeamSize !== game.minTeamSize) {
        throw new GameError("Team sizes can't change after the game has started.");
      }
    }
    tx.update(games)
      .set({ ...s, name: s.name?.trim() || game.name })
      .where(eq(games.id, gameId))
      .run();
    audit(tx, actorId, gameId, "game.settings", s);
  });
}

export function regenerateJoinCode(db: DB, actorId: number, gameId: number): string {
  const code = randomCode(6);
  db.update(games).set({ joinCode: code }).where(eq(games.id, gameId)).run();
  audit(db, actorId, gameId, "game.join_code");
  return code;
}

export function openRegistration(db: DB, actorId: number | null, gameId: number) {
  db.transaction((tx) => {
    const game = getGame(tx, gameId);
    requireStatus(game, "draft");
    const other = tx
      .select()
      .from(games)
      .where(and(inArray(games.status, ["registration", "active", "paused"]), ne(games.id, gameId)))
      .get();
    if (other) throw new GameError(`Finish "${other.name}" before opening a new game.`);
    tx.update(games).set({ status: "registration", signupsOpen: true }).where(eq(games.id, gameId)).run();
    audit(tx, actorId, gameId, "game.open_registration");
  });
}

/** Opens or closes new sign-ups without leaving registration. Existing players can still manage teams. */
export function setSignupsOpen(db: DB, actorId: number | null, gameId: number, open: boolean) {
  db.transaction((tx) => {
    requireStatus(getGame(tx, gameId), "registration");
    tx.update(games).set({ signupsOpen: open }).where(eq(games.id, gameId)).run();
    audit(tx, actorId, gameId, open ? "game.signups_open" : "game.signups_close");
  });
}

/** Validates teams and builds the ring. Returns non-fatal warnings. */
export function startGame(db: DB, actorId: number | null, gameId: number): string[] {
  return db.transaction((tx) => {
    const game = getGame(tx, gameId);
    requireStatus(game, "registration");
    const ps = tx.select().from(participants).where(eq(participants.gameId, gameId)).all();
    const unassigned = ps.filter((p) => p.teamId == null);
    if (unassigned.length) {
      throw new GameError(
        `${unassigned.length} player(s) aren't on a team yet. Use auto-fill or assign them before starting.`,
      );
    }
    const allTeams = tx.select().from(teams).where(eq(teams.gameId, gameId)).all();
    const sizes = new Map<number, number>();
    for (const p of ps) sizes.set(p.teamId!, (sizes.get(p.teamId!) ?? 0) + 1);
    for (const t of allTeams) {
      if (!sizes.has(t.id)) tx.delete(teams).where(eq(teams.id, t.id)).run(); // drop empty teams
    }
    const live = allTeams.filter((t) => sizes.has(t.id));
    for (const t of live) {
      const n = sizes.get(t.id)!;
      if (n < game.minTeamSize) throw new GameError(`Team "${t.name}" has ${n} player(s); the minimum is ${game.minTeamSize}.`);
      if (game.maxTeamSize != null && n > game.maxTeamSize) {
        throw new GameError(`Team "${t.name}" has ${n} players; the maximum is ${game.maxTeamSize}.`);
      }
    }
    if (live.length < 2) throw new GameError("You need at least 2 teams to start.");
    const warnings: string[] = [];
    if (live.length < 3) warnings.push("Only 2 teams: they will be hunting each other.");

    const ring = buildRing(live.map((t) => t.id));
    const t0 = now();
    for (const t of live) {
      tx.update(teams)
        .set({ status: "alive", targetTeamId: ring.get(t.id)!, activityAt: t0, kills: 0, lastKillAt: null })
        .where(eq(teams.id, t.id))
        .run();
    }
    tx.update(participants).set({ status: "alive" }).where(eq(participants.gameId, gameId)).run();
    tx.update(games).set({ status: "active", startedAt: t0 }).where(eq(games.id, gameId)).run();
    audit(tx, actorId, gameId, "game.start", { teams: live.length, players: ps.length });
    return warnings;
  });
}

export function pauseGame(db: DB, actorId: number | null, gameId: number, at = now()) {
  db.transaction((tx) => {
    const game = getGame(tx, gameId);
    requireStatus(game, "active");
    tx.update(games).set({ status: "paused", pausedAt: at }).where(eq(games.id, gameId)).run();
    audit(tx, actorId, gameId, "game.pause");
  });
}

export function resumeGame(db: DB, actorId: number | null, gameId: number, at = now()) {
  db.transaction((tx) => {
    const game = getGame(tx, gameId);
    requireStatus(game, "paused");
    const pausedFor = Math.max(0, at - (game.pausedAt ?? at));
    // Freeze inactivity clocks during the pause by pushing every window forward.
    const alive = tx.select().from(teams).where(and(eq(teams.gameId, gameId), eq(teams.status, "alive"))).all();
    for (const t of alive) {
      if (t.activityAt != null) tx.update(teams).set({ activityAt: t.activityAt + pausedFor }).where(eq(teams.id, t.id)).run();
    }
    tx.update(games)
      .set({ status: "active", pausedAt: null, pausedDurationMs: game.pausedDurationMs + pausedFor })
      .where(eq(games.id, gameId))
      .run();
    audit(tx, actorId, gameId, "game.resume", { pausedForMs: pausedFor });
  });
}

/** Manually end a game (e.g. end of semester). Optionally declare a winning team. */
export function finishGame(db: DB, actorId: number | null, gameId: number, winnerTeamId: number | null) {
  db.transaction((tx) => {
    const game = getGame(tx, gameId);
    requireStatus(game, "registration", "active", "paused");
    if (winnerTeamId != null && getTeam(tx, winnerTeamId).gameId !== gameId) throw new GameError("Invalid team.");
    tx.update(games).set({ status: "finished", endedAt: now(), winnerTeamId, pausedAt: null }).where(eq(games.id, gameId)).run();
    tx.update(killReports)
      .set({ status: "stale", reviewedAt: now(), adminNote: "Game ended" })
      .where(and(eq(killReports.gameId, gameId), eq(killReports.status, "pending")))
      .run();
    audit(tx, actorId, gameId, "game.finish", { winnerTeamId });
  });
}

export function deleteDraftGame(db: DB, actorId: number, gameId: number) {
  db.transaction((tx) => {
    const game = getGame(tx, gameId);
    requireStatus(game, "draft");
    tx.delete(games).where(eq(games.id, gameId)).run();
    audit(tx, actorId, null, "game.delete", { gameId, name: game.name });
  });
}

// ---------------------------------------------------------------------------
// Registration & teams
// ---------------------------------------------------------------------------

export function joinGame(db: DB, userId: number, gameId: number, joinCode: string): Participant {
  return db.transaction((tx) => {
    const game = getGame(tx, gameId);
    if (game.status !== "registration") throw new GameError("Registration is closed.");
    if (!game.signupsOpen) throw new GameError("Sign-ups are closed right now.");
    if (joinCode.trim().toUpperCase() !== game.joinCode) throw new GameError("That join code is wrong.");
    const existing = getParticipantForUser(tx, gameId, userId);
    if (existing) return existing;
    const p = tx.insert(participants).values({ gameId, userId, joinedAt: now() }).returning().get();
    audit(tx, userId, gameId, "player.join");
    return p;
  });
}

function teamSizeCheck(c: Conn, game: Game, teamId: number, adding = 1) {
  if (game.maxTeamSize != null && teamMembers(c, teamId).length + adding > game.maxTeamSize) {
    throw new GameError(`Teams can have at most ${game.maxTeamSize} player(s).`);
  }
}

function newTeam(c: Conn, gameId: number, name: string): Team {
  return c
    .insert(teams)
    .values({ gameId, name: name.trim().slice(0, 40) || "Unnamed team", inviteCode: randomCode(6) })
    .returning()
    .get();
}

function deleteTeamIfEmpty(c: Conn, teamId: number | null) {
  if (teamId != null && teamMembers(c, teamId).length === 0) c.delete(teams).where(eq(teams.id, teamId)).run();
}

function registrationParticipant(c: Conn, gameId: number, userId: number) {
  const game = getGame(c, gameId);
  if (game.status !== "registration") throw new GameError("Teams are locked once the game starts.");
  const p = getParticipantForUser(c, gameId, userId);
  if (!p) throw new GameError("You haven't joined this game.");
  return { game, p };
}

export function createTeam(db: DB, gameId: number, userId: number, name: string): Team {
  return db.transaction((tx) => {
    const { p } = registrationParticipant(tx, gameId, userId);
    const team = newTeam(tx, gameId, name);
    tx.update(participants).set({ teamId: team.id }).where(eq(participants.id, p.id)).run();
    deleteTeamIfEmpty(tx, p.teamId);
    audit(tx, userId, gameId, "team.create", { teamId: team.id, name: team.name });
    return team;
  });
}

export function joinTeam(db: DB, gameId: number, userId: number, inviteCode: string): Team {
  return db.transaction((tx) => {
    const { game, p } = registrationParticipant(tx, gameId, userId);
    const team = tx
      .select()
      .from(teams)
      .where(and(eq(teams.gameId, gameId), eq(teams.inviteCode, inviteCode.trim().toUpperCase())))
      .get();
    if (!team) throw new GameError("No team has that invite code.");
    if (p.teamId === team.id) return team;
    teamSizeCheck(tx, game, team.id);
    tx.update(participants).set({ teamId: team.id }).where(eq(participants.id, p.id)).run();
    deleteTeamIfEmpty(tx, p.teamId);
    audit(tx, userId, gameId, "team.join", { teamId: team.id });
    return team;
  });
}

export function leaveTeam(db: DB, gameId: number, userId: number) {
  db.transaction((tx) => {
    const { p } = registrationParticipant(tx, gameId, userId);
    tx.update(participants).set({ teamId: null }).where(eq(participants.id, p.id)).run();
    deleteTeamIfEmpty(tx, p.teamId);
    audit(tx, userId, gameId, "team.leave", { teamId: p.teamId });
  });
}

export function leaveGame(db: DB, gameId: number, userId: number) {
  db.transaction((tx) => {
    const { p } = registrationParticipant(tx, gameId, userId);
    tx.delete(participants).where(eq(participants.id, p.id)).run();
    deleteTeamIfEmpty(tx, p.teamId);
    audit(tx, userId, gameId, "player.leave");
  });
}

export function renameTeam(db: DB, actorId: number, teamId: number, name: string) {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new GameError("Team name can't be empty.");
  const team = getTeam(db, teamId);
  db.update(teams).set({ name: clean }).where(eq(teams.id, teamId)).run();
  audit(db, actorId, team.gameId, "team.rename", { teamId, name: clean });
}

/** Admin: move a player to a team, to a brand-new team ("new"), or to unassigned (null). */
export function movePlayer(db: DB, actorId: number, participantId: number, to: number | "new" | null) {
  db.transaction((tx) => {
    const p = getParticipant(tx, participantId);
    const game = getGame(tx, p.gameId);
    requireStatus(game, "registration");
    let teamId: number | null = null;
    if (to === "new") {
      teamId = newTeam(tx, game.id, `Team ${displayNameOf(tx, p.userId)}`).id;
    } else if (to != null) {
      const team = getTeam(tx, to);
      if (team.gameId !== game.id) throw new GameError("Invalid team.");
      if (team.id !== p.teamId) teamSizeCheck(tx, game, team.id);
      teamId = team.id;
    }
    tx.update(participants).set({ teamId }).where(eq(participants.id, p.id)).run();
    deleteTeamIfEmpty(tx, p.teamId);
    audit(tx, actorId, game.id, "admin.move_player", { participantId, from: p.teamId, to: teamId });
  });
}

export function mergeTeams(db: DB, actorId: number, fromTeamId: number, intoTeamId: number) {
  db.transaction((tx) => {
    const from = getTeam(tx, fromTeamId);
    const into = getTeam(tx, intoTeamId);
    if (from.gameId !== into.gameId || from.id === into.id) throw new GameError("Invalid teams.");
    const game = getGame(tx, from.gameId);
    requireStatus(game, "registration");
    teamSizeCheck(tx, game, into.id, teamMembers(tx, from.id).length);
    tx.update(participants).set({ teamId: into.id }).where(eq(participants.teamId, from.id)).run();
    tx.delete(teams).where(eq(teams.id, from.id)).run();
    audit(tx, actorId, game.id, "admin.merge_teams", { fromTeamId, intoTeamId });
  });
}

/**
 * Admin: randomly group unassigned players. With a team size > 1 they first top up
 * existing under-full teams, then form new teams of `size`.
 */
export function autoFillTeams(db: DB, actorId: number, gameId: number, size: number): number {
  return db.transaction((tx) => {
    const game = getGame(tx, gameId);
    requireStatus(game, "registration");
    if (size < 1) throw new GameError("Team size must be at least 1.");
    if (game.maxTeamSize != null && size > game.maxTeamSize) {
      throw new GameError(`Size can't exceed the max team size (${game.maxTeamSize}).`);
    }
    const pool = shuffle(
      tx.select().from(participants).where(and(eq(participants.gameId, gameId), isNull(participants.teamId))).all(),
    );
    const placed = pool.length;
    if (size > 1) {
      const existing = tx.select().from(teams).where(eq(teams.gameId, gameId)).all();
      for (const t of existing) {
        let room = size - teamMembers(tx, t.id).length;
        while (room-- > 0 && pool.length) {
          const p = pool.pop()!;
          tx.update(participants).set({ teamId: t.id }).where(eq(participants.id, p.id)).run();
        }
      }
    }
    const groups = groupIntoTeams(pool, size);
    let n = tx.select().from(teams).where(eq(teams.gameId, gameId)).all().length;
    for (const group of groups) {
      const team = newTeam(tx, gameId, size === 1 ? "Solo" : `Team ${++n}`);
      if (size === 1) {
        tx.update(teams).set({ name: displayNameOf(tx, group[0].userId) }).where(eq(teams.id, team.id)).run();
      }
      for (const p of group) tx.update(participants).set({ teamId: team.id }).where(eq(participants.id, p.id)).run();
    }
    audit(tx, actorId, gameId, "admin.auto_fill", { size, placed });
    return placed;
  });
}

// ---------------------------------------------------------------------------
// Kills
// ---------------------------------------------------------------------------

export interface KillDetails {
  occurredAt?: number;
  location?: string;
  description?: string;
}

export function submitKill(db: DB, gameId: number, userId: number, victimId: number, d: KillDetails = {}) {
  return db.transaction((tx) => {
    const game = getGame(tx, gameId);
    if (game.status !== "active") throw new GameError("Kills can only be reported while the game is active.");
    const me = getParticipantForUser(tx, gameId, userId);
    if (!me || me.status !== "alive" || me.teamId == null) throw new GameError("You're not an alive player in this game.");
    const myTeam = getTeam(tx, me.teamId);
    const victim = getParticipant(tx, victimId);
    if (victim.gameId !== gameId || victim.teamId == null || victim.teamId !== myTeam.targetTeamId) {
      throw new GameError("That player isn't on your target team.");
    }
    if (victim.status !== "alive") throw new GameError("That player is already out.");
    const dup = tx
      .select()
      .from(killReports)
      .where(and(eq(killReports.victimId, victimId), eq(killReports.status, "pending")))
      .get();
    if (dup) throw new GameError("A kill on that player is already waiting for admin review.");
    const report = tx
      .insert(killReports)
      .values({
        gameId,
        assassinId: me.id,
        victimId,
        occurredAt: d.occurredAt ?? now(),
        location: (d.location ?? "").slice(0, 200),
        description: (d.description ?? "").slice(0, 1000),
        createdAt: now(),
      })
      .returning()
      .get();
    audit(tx, userId, gameId, "kill.submit", { reportId: report.id, victimId });
    return report;
  });
}

/** Removes a team from the ring and ends the game if one (or zero) teams remain. */
function eliminateTeam(
  tx: Tx,
  game: Game,
  teamId: number,
  status: "eliminated" | "purged",
  byTeamId: number | null,
  at: number,
) {
  const ring = loadRing(tx, game.id);
  removeFromRing(ring, teamId);
  tx.update(teams)
    .set({ status, eliminatedAt: at, eliminatedByTeamId: byTeamId, targetTeamId: null })
    .where(eq(teams.id, teamId))
    .run();
  saveRing(tx, game.id, ring);
  const victims = teamMembers(tx, teamId).map((m) => m.id);
  if (victims.length) {
    tx.update(killReports)
      .set({ status: "stale", reviewedAt: at, adminNote: "Target team was eliminated" })
      .where(and(eq(killReports.status, "pending"), inArray(killReports.victimId, victims)))
      .run();
  }
  checkForWinner(tx, game.id, at);
}

function checkForWinner(tx: Tx, gameId: number, at: number) {
  const alive = tx.select().from(teams).where(and(eq(teams.gameId, gameId), eq(teams.status, "alive"))).all();
  if (alive.length > 1) return;
  const winner = alive[0] ?? null;
  if (winner) tx.update(teams).set({ targetTeamId: null }).where(eq(teams.id, winner.id)).run();
  tx.update(games)
    .set({ status: "finished", endedAt: at, winnerTeamId: winner?.id ?? null, pausedAt: null })
    .where(eq(games.id, gameId))
    .run();
  tx.update(killReports)
    .set({ status: "stale", reviewedAt: at, adminNote: "Game ended" })
    .where(and(eq(killReports.gameId, gameId), eq(killReports.status, "pending")))
    .run();
  audit(tx, null, gameId, "game.won", { winnerTeamId: winner?.id ?? null });
}

/** Returns why a pending report can no longer be approved, or null if it is still valid. */
export function reportProblem(c: Conn, reportId: number): string | null {
  const r = c.select().from(killReports).where(eq(killReports.id, reportId)).get();
  if (!r) return "Report not found.";
  if (r.status !== "pending") return `Report is already ${r.status}.`;
  const a = getParticipant(c, r.assassinId);
  const v = getParticipant(c, r.victimId);
  if (a.status !== "alive") return "The assassin is no longer alive.";
  if (v.status !== "alive") return "The victim is already out.";
  const aTeam = a.teamId != null ? getTeam(c, a.teamId) : null;
  if (!aTeam || aTeam.status !== "alive" || aTeam.targetTeamId !== v.teamId) {
    return "The victim's team is no longer the assassin's target.";
  }
  return null;
}

export function approveKill(db: DB, actorId: number | null, reportId: number, note?: string): { stale: boolean } {
  return db.transaction((tx) => approveInTx(tx, actorId, reportId, note));
}

/** Approves a pending report, or marks it stale if it no longer applies. `actorId` null = no admin involved. */
function approveInTx(tx: Tx, actorId: number | null, reportId: number, note?: string, auditActorId = actorId): { stale: boolean } {
  const r = tx.select().from(killReports).where(eq(killReports.id, reportId)).get();
  if (!r) throw new GameError("Report not found.");
  if (r.status !== "pending") throw new GameError(`Report is already ${r.status}.`);
  const game = getGame(tx, r.gameId);
  requireStatus(game, "active", "paused");
  const at = now();
  const problem = reportProblem(tx, reportId);
  if (problem) {
    tx.update(killReports)
      .set({ status: "stale", reviewedBy: actorId, reviewedAt: at, adminNote: problem })
      .where(eq(killReports.id, reportId))
      .run();
    audit(tx, auditActorId, game.id, "kill.stale", { reportId, problem });
    return { stale: true };
  }
  const assassin = getParticipant(tx, r.assassinId);
  const victim = getParticipant(tx, r.victimId);
  const aTeam = getTeam(tx, assassin.teamId!);

  tx.update(killReports)
    .set({ status: "approved", reviewedBy: actorId, reviewedAt: at, adminNote: note ?? null })
    .where(eq(killReports.id, reportId))
    .run();
  tx.update(participants)
    .set({ status: "eliminated", eliminatedAt: at, eliminatedById: assassin.id })
    .where(eq(participants.id, victim.id))
    .run();
  tx.update(participants).set({ kills: assassin.kills + 1 }).where(eq(participants.id, assassin.id)).run();
  tx.update(teams)
    .set({ kills: aTeam.kills + 1, lastKillAt: r.occurredAt, activityAt: Math.max(at, aTeam.activityAt ?? 0) })
    .where(eq(teams.id, aTeam.id))
    .run();
  audit(tx, auditActorId, game.id, "kill.approve", { reportId, assassinId: assassin.id, victimId: victim.id });

  if (aliveCount(tx, victim.teamId!) === 0) eliminateTeam(tx, game, victim.teamId!, "eliminated", aTeam.id, at);
  return { stale: false };
}

/**
 * The victim answers a pending report against them. Confirming approves the kill right
 * away (admins see it afterwards in the kill queue); disputing leaves it pending for an
 * admin, with the victim's side of the story attached.
 */
export function respondToKill(
  db: DB,
  userId: number,
  reportId: number,
  response: VictimResponse,
  note = "",
): { stale: boolean } {
  return db.transaction((tx) => {
    const r = tx.select().from(killReports).where(eq(killReports.id, reportId)).get();
    const me = r ? getParticipantForUser(tx, r.gameId, userId) : undefined;
    if (!r || !me || me.id !== r.victimId) throw new GameError("Report not found.");
    if (r.status !== "pending") throw new GameError(`That report is already ${r.status}.`);
    if (r.victimResponse) throw new GameError(`You already ${r.victimResponse} this report.`);
    const trimmed = note.trim().slice(0, 1000);
    if (response === "disputed" && !trimmed) throw new GameError("Tell the admins what really happened.");
    tx.update(killReports)
      .set({ victimResponse: response, victimNote: trimmed || null, victimRespondedAt: now() })
      .where(eq(killReports.id, reportId))
      .run();
    if (response === "disputed") {
      audit(tx, userId, r.gameId, "kill.dispute", { reportId });
      return { stale: false };
    }
    audit(tx, userId, r.gameId, "kill.confirm", { reportId });
    return approveInTx(tx, null, reportId, undefined, userId);
  });
}

/** Admin acknowledges victim-confirmed kills: one report, or every unseen one in the game. */
export function acknowledgeConfirmedKills(db: DB, actorId: number, gameId: number, reportId?: number) {
  db.update(killReports)
    .set({ adminSeenAt: now() })
    .where(
      and(
        eq(killReports.gameId, gameId),
        eq(killReports.victimResponse, "confirmed"),
        isNull(killReports.adminSeenAt),
        reportId != null ? eq(killReports.id, reportId) : undefined,
      ),
    )
    .run();
  audit(db, actorId, gameId, "kill.acknowledge", reportId != null ? { reportId } : {});
}

export function rejectKill(db: DB, actorId: number | null, reportId: number, note?: string) {
  db.transaction((tx) => {
    const r = tx.select().from(killReports).where(eq(killReports.id, reportId)).get();
    if (!r) throw new GameError("Report not found.");
    if (r.status !== "pending") throw new GameError(`Report is already ${r.status}.`);
    tx.update(killReports)
      .set({ status: "rejected", reviewedBy: actorId, reviewedAt: now(), adminNote: note?.slice(0, 500) || null })
      .where(eq(killReports.id, reportId))
      .run();
    audit(tx, actorId, r.gameId, "kill.reject", { reportId, note });
  });
}

/** A player withdraws their own pending report. */
export function withdrawKill(db: DB, userId: number, reportId: number) {
  db.transaction((tx) => {
    const r = tx.select().from(killReports).where(eq(killReports.id, reportId)).get();
    if (!r || r.status !== "pending") throw new GameError("Report not found.");
    const me = getParticipantForUser(tx, r.gameId, userId);
    if (!me || me.id !== r.assassinId) throw new GameError("Report not found.");
    tx.delete(killReports).where(eq(killReports.id, reportId)).run();
    audit(tx, userId, r.gameId, "kill.withdraw", { reportId });
  });
}

// ---------------------------------------------------------------------------
// Admin corrections
// ---------------------------------------------------------------------------

/** Purge or disqualify one player. If their team is left with nobody alive, it leaves the ring. */
export function removePlayer(db: DB, actorId: number | null, participantId: number, reason = "") {
  db.transaction((tx) => {
    const p = getParticipant(tx, participantId);
    const game = getGame(tx, p.gameId);
    requireStatus(game, "active", "paused");
    if (p.status !== "alive") throw new GameError("That player is already out.");
    const at = now();
    tx.update(participants).set({ status: "purged", eliminatedAt: at }).where(eq(participants.id, p.id)).run();
    tx.update(killReports)
      .set({ status: "stale", reviewedAt: at, adminNote: "Player removed" })
      .where(and(eq(killReports.status, "pending"), eq(killReports.assassinId, p.id)))
      .run();
    tx.update(killReports)
      .set({ status: "stale", reviewedAt: at, adminNote: "Victim removed" })
      .where(and(eq(killReports.status, "pending"), eq(killReports.victimId, p.id)))
      .run();
    audit(tx, actorId, game.id, "admin.remove_player", { participantId, reason });
    if (p.teamId != null && aliveCount(tx, p.teamId) === 0) eliminateTeam(tx, game, p.teamId, "purged", null, at);
  });
}

/** Purge an entire team (e.g. inactivity or disqualification). */
export function removeTeam(db: DB, actorId: number | null, teamId: number, reason = "") {
  db.transaction((tx) => removeTeamTx(tx, actorId, teamId, reason));
}

function removeTeamTx(tx: Tx, actorId: number | null, teamId: number, reason: string) {
  const team = getTeam(tx, teamId);
  const game = getGame(tx, team.gameId);
  requireStatus(game, "active", "paused");
  if (team.status !== "alive") throw new GameError(`Team "${team.name}" is already out.`);
  const at = now();
  const members = teamMembers(tx, teamId);
  tx.update(participants)
    .set({ status: "purged", eliminatedAt: at })
    .where(and(eq(participants.teamId, teamId), eq(participants.status, "alive")))
    .run();
  const ids = members.map((m) => m.id);
  if (ids.length) {
    tx.update(killReports)
      .set({ status: "stale", reviewedAt: at, adminNote: "Team removed" })
      .where(and(eq(killReports.status, "pending"), inArray(killReports.assassinId, ids)))
      .run();
  }
  audit(tx, actorId, game.id, "admin.remove_team", { teamId, reason });
  eliminateTeam(tx, game, teamId, "purged", null, at);
}

export interface InactiveTeam {
  team: Team;
  deadline: number;
}

export function getInactiveTeams(c: Conn, gameId: number, at = now()): InactiveTeam[] {
  const game = getGame(c, gameId);
  if (game.inactivityDays == null || (game.status !== "active" && game.status !== "paused")) return [];
  return c
    .select()
    .from(teams)
    .where(and(eq(teams.gameId, gameId), eq(teams.status, "alive")))
    .all()
    .map((team) => ({
      team,
      deadline: inactivityDeadline(team.activityAt ?? game.startedAt ?? at, game.inactivityDays!, game.pausedAt, at),
    }))
    .filter((x) => x.deadline <= at)
    .sort((a, b) => a.deadline - b.deadline);
}

/** Admin-confirmed bulk purge of the given (previewed) inactive teams. */
export function purgeInactive(db: DB, actorId: number | null, gameId: number, teamIds: number[], at = now()): number {
  return db.transaction((tx) => {
    const inactive = new Set(getInactiveTeams(tx, gameId, at).map((x) => x.team.id));
    let n = 0;
    for (const id of teamIds) {
      if (!inactive.has(id)) continue;
      if (getGame(tx, gameId).status === "finished") break;
      removeTeamTx(tx, actorId, id, "inactivity");
      n++;
    }
    return n;
  });
}

/** Re-randomise the ring among alive teams and restart everyone's inactivity window. */
export function reshuffleAlive(db: DB, actorId: number | null, gameId: number) {
  db.transaction((tx) => {
    const game = getGame(tx, gameId);
    requireStatus(game, "active", "paused");
    const alive = tx.select().from(teams).where(and(eq(teams.gameId, gameId), eq(teams.status, "alive"))).all();
    if (alive.length < 2) throw new GameError("Not enough teams to reshuffle.");
    const ring = buildRing(alive.map((t) => t.id));
    saveRing(tx, gameId, ring);
    const at = game.status === "paused" ? (game.pausedAt ?? now()) : now();
    tx.update(teams).set({ activityAt: at }).where(and(eq(teams.gameId, gameId), eq(teams.status, "alive"))).run();
    tx.update(killReports)
      .set({ status: "stale", reviewedAt: now(), adminNote: "Ring was reshuffled" })
      .where(and(eq(killReports.gameId, gameId), eq(killReports.status, "pending")))
      .run();
    audit(tx, actorId, gameId, "admin.reshuffle", { teams: alive.length });
  });
}

/**
 * Bring a player back (e.g. a kill was approved by mistake). If their team had been
 * knocked out, the team rejoins the ring hunting `insertBeforeTeamId` (random if omitted).
 * Reviving into a finished game re-opens it.
 */
export function reviveParticipant(db: DB, actorId: number | null, participantId: number, insertBeforeTeamId?: number) {
  db.transaction((tx) => {
    const p = getParticipant(tx, participantId);
    if (p.status === "alive") throw new GameError("That player is already alive.");
    if (p.teamId == null) throw new GameError("That player has no team.");
    let game = getGame(tx, p.gameId);
    requireStatus(game, "active", "paused", "finished");
    const team = getTeam(tx, p.teamId);
    const at = now();

    if (game.status === "finished") {
      tx.update(games).set({ status: "active", endedAt: null, winnerTeamId: null }).where(eq(games.id, game.id)).run();
      game = getGame(tx, game.id);
    }

    if (team.status !== "alive") {
      const ring = loadRing(tx, game.id);
      const alive = tx.select().from(teams).where(and(eq(teams.gameId, game.id), eq(teams.status, "alive"))).all();
      if (alive.length === 0) throw new GameError("No teams left to rejoin.");
      if (alive.length === 1) {
        ring.set(alive[0].id, team.id);
        ring.set(team.id, alive[0].id);
      } else {
        const before = insertBeforeTeamId ?? shuffle(alive.map((t) => t.id))[0];
        if (!ring.has(before)) throw new GameError("Pick an alive team to insert before.");
        insertIntoRing(ring, team.id, before);
      }
      tx.update(teams)
        .set({ status: "alive", eliminatedAt: null, eliminatedByTeamId: null, activityAt: at })
        .where(eq(teams.id, team.id))
        .run();
      saveRing(tx, game.id, ring);
    }
    tx.update(participants)
      .set({ status: "alive", eliminatedAt: null, eliminatedById: null })
      .where(eq(participants.id, p.id))
      .run();
    // If they were killed via an approved report, undo the kill credit.
    if (p.eliminatedById != null) {
      const killer = getParticipant(tx, p.eliminatedById);
      tx.update(participants).set({ kills: Math.max(0, killer.kills - 1) }).where(eq(participants.id, killer.id)).run();
      if (killer.teamId != null) {
        const kt = getTeam(tx, killer.teamId);
        tx.update(teams).set({ kills: Math.max(0, kt.kills - 1) }).where(eq(teams.id, kt.id)).run();
      }
      tx.update(killReports)
        .set({ status: "rejected", reviewedBy: actorId, reviewedAt: at, adminNote: "Reversed: victim revived" })
        .where(and(eq(killReports.victimId, p.id), eq(killReports.status, "approved")))
        .run();
    }
    audit(tx, actorId, game.id, "admin.revive", { participantId, insertBeforeTeamId });
  });
}

/** Ring problems for the admin page; an empty list means everything is consistent. */
export function checkRing(c: Conn, gameId: number): string[] {
  const game = getGame(c, gameId);
  if (game.status !== "active" && game.status !== "paused") return [];
  const alive = c.select().from(teams).where(and(eq(teams.gameId, gameId), eq(teams.status, "alive"))).all();
  const problems = validateRing(
    alive.map((t) => t.id),
    loadRing(c, gameId),
  );
  for (const t of alive) if (aliveCount(c, t.id) === 0) problems.push(`Team "${t.name}" is alive but has no alive players.`);
  return problems;
}
