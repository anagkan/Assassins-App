import { aliasedTable, and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import type { DB } from "@/db";
import { announcements, killReports, participants, teams, users, type Game, type Team } from "@/db/schema";
import { getParticipantForUser, reportProblem } from "./game";
import { inactivityDeadline, ringOrder, type Ring } from "./ring";

export interface Member {
  participantId: number;
  userId: number;
  displayName: string;
  username: string;
  photoPath: string | null;
  status: "alive" | "eliminated" | "purged";
  kills: number;
}

function membersOf(db: DB, teamIds: number[]): Map<number, Member[]> {
  const out = new Map<number, Member[]>();
  if (!teamIds.length) return out;
  const rows = db
    .select({
      participantId: participants.id,
      teamId: participants.teamId,
      userId: users.id,
      displayName: users.displayName,
      username: users.username,
      photoPath: users.photoPath,
      status: participants.status,
      kills: participants.kills,
    })
    .from(participants)
    .innerJoin(users, eq(users.id, participants.userId))
    .where(inArray(participants.teamId, teamIds))
    .orderBy(asc(users.displayName))
    .all();
  for (const { teamId, ...m } of rows) {
    if (!out.has(teamId!)) out.set(teamId!, []);
    out.get(teamId!)!.push(m);
  }
  return out;
}

export function teamWithMembers(db: DB, teamId: number) {
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) return null;
  return { team, members: membersOf(db, [teamId]).get(teamId) ?? [] };
}

export function activeAnnouncements(db: DB, gameId: number, at = Date.now()) {
  return db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.gameId, gameId),
        lte(announcements.activeFrom, at),
        or(isNull(announcements.activeUntil), gt(announcements.activeUntil, at)),
      ),
    )
    .orderBy(desc(announcements.activeFrom))
    .all();
}

export function dashboard(db: DB, game: Game, userId: number) {
  const me = getParticipantForUser(db, game.id, userId);
  if (!me) return { me: null } as const;
  const myTeam = me.teamId != null ? teamWithMembers(db, me.teamId) : null;
  const playing = (game.status === "active" || game.status === "paused") && myTeam?.team.status === "alive";
  const target = playing && myTeam?.team.targetTeamId != null ? teamWithMembers(db, myTeam.team.targetTeamId) : null;

  const victimP = aliasedTable(participants, "victim_p");
  const victimU = aliasedTable(users, "victim_u");
  const assassinP = aliasedTable(participants, "assassin_p");
  const assassinU = aliasedTable(users, "assassin_u");
  const teamReports = myTeam
    ? db
        .select({
          id: killReports.id,
          status: killReports.status,
          createdAt: killReports.createdAt,
          adminNote: killReports.adminNote,
          assassinId: killReports.assassinId,
          assassinName: assassinU.displayName,
          victimName: victimU.displayName,
        })
        .from(killReports)
        .innerJoin(assassinP, eq(assassinP.id, killReports.assassinId))
        .innerJoin(assassinU, eq(assassinU.id, assassinP.userId))
        .innerJoin(victimP, eq(victimP.id, killReports.victimId))
        .innerJoin(victimU, eq(victimU.id, victimP.userId))
        .where(and(eq(killReports.gameId, game.id), eq(assassinP.teamId, myTeam.team.id)))
        .orderBy(desc(killReports.createdAt))
        .limit(10)
        .all()
    : [];

  const deadline =
    playing && game.inactivityDays != null && myTeam
      ? inactivityDeadline(myTeam.team.activityAt ?? game.startedAt ?? Date.now(), game.inactivityDays, game.pausedAt, Date.now())
      : null;

  return { me, myTeam, target, teamReports, deadline } as const;
}

export type FeedEvent =
  | { kind: "kill"; at: number; victim: string; victimTeam: string; killer: string; killerTeam: string; solo: boolean }
  | { kind: "team_out"; at: number; team: string; by: string | null; purged: boolean }
  | { kind: "player_removed"; at: number; player: string; team: string };

export function feed(db: DB, gameId: number): FeedEvent[] {
  const victimP = aliasedTable(participants, "victim_p");
  const victimU = aliasedTable(users, "victim_u");
  const victimT = aliasedTable(teams, "victim_t");
  const killerP = aliasedTable(participants, "killer_p");
  const killerU = aliasedTable(users, "killer_u");
  const killerT = aliasedTable(teams, "killer_t");
  const kills = db
    .select({
      at: killReports.reviewedAt,
      victim: victimU.displayName,
      victimTeam: victimT.name,
      victimTeamId: victimT.id,
      killer: killerU.displayName,
      killerTeam: killerT.name,
    })
    .from(killReports)
    .innerJoin(victimP, eq(victimP.id, killReports.victimId))
    .innerJoin(victimU, eq(victimU.id, victimP.userId))
    .innerJoin(victimT, eq(victimT.id, victimP.teamId))
    .innerJoin(killerP, eq(killerP.id, killReports.assassinId))
    .innerJoin(killerU, eq(killerU.id, killerP.userId))
    .innerJoin(killerT, eq(killerT.id, killerP.teamId))
    .where(and(eq(killReports.gameId, gameId), eq(killReports.status, "approved")))
    .all();

  const allTeams = db.select().from(teams).where(eq(teams.gameId, gameId)).all();
  const byId = new Map(allTeams.map((t) => [t.id, t]));
  const sizes = membersOf(db, allTeams.map((t) => t.id));
  const events: FeedEvent[] = kills.map(({ victimTeamId, ...k }) => ({
    kind: "kill",
    ...k,
    at: k.at ?? 0,
    solo: (sizes.get(victimTeamId)?.length ?? 0) === 1,
  }));
  for (const t of allTeams) {
    if (t.eliminatedAt && t.status !== "alive" && (sizes.get(t.id)?.length ?? 0) > 1) {
      events.push({
        kind: "team_out",
        at: t.eliminatedAt + 1, // sort just after the kill that caused it
        team: t.name,
        by: t.eliminatedByTeamId ? (byId.get(t.eliminatedByTeamId)?.name ?? null) : null,
        purged: t.status === "purged",
      });
    }
    for (const m of sizes.get(t.id) ?? []) {
      if (m.status === "purged") {
        const p = db.select({ at: participants.eliminatedAt }).from(participants).where(eq(participants.id, m.participantId)).get();
        events.push({ kind: "player_removed", at: p?.at ?? 0, player: m.displayName, team: t.name });
      }
    }
  }
  return events.sort((a, b) => b.at - a.at);
}

export function leaderboard(db: DB, gameId: number) {
  const allTeams = db.select().from(teams).where(eq(teams.gameId, gameId)).all();
  const members = membersOf(db, allTeams.map((t) => t.id));
  const teamRows = allTeams
    .map((t) => {
      const ms = members.get(t.id) ?? [];
      return { team: t, size: ms.length, alive: ms.filter((m) => m.status === "alive").length };
    })
    .sort(
      (a, b) =>
        Number(b.team.status === "alive") - Number(a.team.status === "alive") ||
        b.team.kills - a.team.kills ||
        b.alive - a.alive ||
        (b.team.eliminatedAt ?? 0) - (a.team.eliminatedAt ?? 0),
    );
  const players = allTeams
    .flatMap((t) => (members.get(t.id) ?? []).map((m) => ({ ...m, teamName: t.name })))
    .sort((a, b) => b.kills - a.kills || Number(b.status === "alive") - Number(a.status === "alive"));
  return { teamRows, players };
}

export function gameStats(db: DB, gameId: number) {
  const ps = db.select({ status: participants.status }).from(participants).where(eq(participants.gameId, gameId)).all();
  const ts = db.select({ status: teams.status }).from(teams).where(eq(teams.gameId, gameId)).all();
  return {
    players: ps.length,
    alivePlayers: ps.filter((p) => p.status === "alive").length,
    teams: ts.length,
    aliveTeams: ts.filter((t) => t.status === "alive").length,
  };
}

// ---------------------------------------------------------------------------
// Admin read models
// ---------------------------------------------------------------------------

export function adminTeams(db: DB, gameId: number) {
  const allTeams = db.select().from(teams).where(eq(teams.gameId, gameId)).orderBy(asc(teams.name)).all();
  const members = membersOf(db, allTeams.map((t) => t.id));
  const unassigned = db
    .select({ participantId: participants.id, displayName: users.displayName, username: users.username })
    .from(participants)
    .innerJoin(users, eq(users.id, participants.userId))
    .where(and(eq(participants.gameId, gameId), isNull(participants.teamId)))
    .orderBy(asc(users.displayName))
    .all();
  const byId = new Map(allTeams.map((t) => [t.id, t]));
  return {
    teams: allTeams.map((t) => ({
      team: t,
      members: members.get(t.id) ?? [],
      targetName: t.targetTeamId ? (byId.get(t.targetTeamId)?.name ?? "?") : null,
    })),
    unassigned,
  };
}

export function ringView(db: DB, gameId: number) {
  const alive = db.select().from(teams).where(and(eq(teams.gameId, gameId), eq(teams.status, "alive"))).all();
  const ring: Ring = new Map();
  for (const t of alive) if (t.targetTeamId != null) ring.set(t.id, t.targetTeamId);
  const byId = new Map<number, Team>(alive.map((t) => [t.id, t]));
  const members = membersOf(db, alive.map((t) => t.id));
  return ringOrder(ring).map((id) => ({
    team: byId.get(id)!,
    alive: (members.get(id) ?? []).filter((m) => m.status === "alive"),
  }));
}

export function pendingReports(db: DB, gameId: number) {
  return reportRows(db, gameId, "pending").map((r) => ({ ...r, problem: reportProblem(db, r.id) }));
}

export function reportRows(db: DB, gameId: number, status?: "pending" | "approved" | "rejected" | "stale", limit = 200) {
  const victimP = aliasedTable(participants, "victim_p");
  const victimU = aliasedTable(users, "victim_u");
  const victimT = aliasedTable(teams, "victim_t");
  const killerP = aliasedTable(participants, "killer_p");
  const killerU = aliasedTable(users, "killer_u");
  const killerT = aliasedTable(teams, "killer_t");
  return db
    .select({
      id: killReports.id,
      status: killReports.status,
      occurredAt: killReports.occurredAt,
      createdAt: killReports.createdAt,
      reviewedAt: killReports.reviewedAt,
      location: killReports.location,
      description: killReports.description,
      adminNote: killReports.adminNote,
      killer: killerU.displayName,
      killerTeam: killerT.name,
      victim: victimU.displayName,
      victimTeam: victimT.name,
    })
    .from(killReports)
    .innerJoin(victimP, eq(victimP.id, killReports.victimId))
    .innerJoin(victimU, eq(victimU.id, victimP.userId))
    .leftJoin(victimT, eq(victimT.id, victimP.teamId))
    .innerJoin(killerP, eq(killerP.id, killReports.assassinId))
    .innerJoin(killerU, eq(killerU.id, killerP.userId))
    .leftJoin(killerT, eq(killerT.id, killerP.teamId))
    .where(status ? and(eq(killReports.gameId, gameId), eq(killReports.status, status)) : eq(killReports.gameId, gameId))
    .orderBy(status === "pending" ? asc(killReports.createdAt) : desc(killReports.createdAt))
    .limit(limit)
    .all();
}
