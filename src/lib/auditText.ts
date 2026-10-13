import { aliasedTable, eq, inArray } from "drizzle-orm";
import { fmtDuration } from "@/components/ui";
import type { DB } from "@/db";
import { games, killReports, participants, teams, users } from "@/db/schema";

type Payload = Record<string, unknown>;

/** Labels for the audit log's action filter, grouped by the prefix before the dot. */
export const AUDIT_ACTIONS: Record<string, string> = {
  "game.create": "Game created",
  "game.settings": "Settings saved",
  "game.join_code": "Join code regenerated",
  "game.open_registration": "Registration opened",
  "game.signups_open": "Sign-ups reopened",
  "game.signups_close": "Sign-ups closed",
  "game.start": "Game started",
  "game.pause": "Game paused",
  "game.resume": "Game resumed",
  "game.finish": "Game finished",
  "game.won": "Game won",
  "game.delete": "Draft deleted",
  "player.join": "Player joined",
  "player.leave": "Player left",
  "team.create": "Team created",
  "team.join": "Team joined",
  "team.leave": "Team left",
  "team.rename": "Team renamed",
  "kill.submit": "Kill reported",
  "kill.confirm": "Kill confirmed by victim",
  "kill.dispute": "Kill disputed by victim",
  "kill.approve": "Kill approved",
  "kill.reject": "Kill rejected",
  "kill.stale": "Report went stale",
  "kill.withdraw": "Report withdrawn",
  "kill.undo": "Kill undone",
  "kill.acknowledge": "Confirmed kill marked seen",
  "admin.move_player": "Player moved",
  "admin.merge_teams": "Teams merged",
  "admin.auto_fill": "Teams auto-filled",
  "admin.kick_player": "Sign-up removed",
  "admin.remove_player": "Player removed",
  "admin.remove_team": "Team removed",
  "admin.revive": "Player revived",
  "admin.reshuffle": "Ring reshuffled",
  "admin.create_user": "Account created",
  "admin.reset_password": "Password reset",
  "admin.update_user": "Account edited",
  "admin.delete_user": "Account deleted",
  "admin.promote": "Admin added",
  "admin.demote": "Admin removed",
  "announcement.create": "Announcement posted",
  "announcement.update": "Announcement edited",
  "announcement.delete": "Announcement deleted",
  "registration.code": "Registration code set",
  "registration.close": "Account sign-ups closed",
};

export const AUDIT_GROUPS: Record<string, string> = {
  game: "Game",
  player: "Players",
  team: "Teams",
  kill: "Kills",
  admin: "Admin",
  announcement: "Announcements",
  registration: "Registration",
};

const PARTICIPANT_KEYS = ["participantId", "victimId", "assassinId"];
const TEAM_KEYS = ["teamId", "from", "to", "fromTeamId", "intoTeamId", "winnerTeamId", "insertBeforeTeamId"];

// displayName is left out: it follows from the first and last name.
const ACCOUNT_FIELDS: Record<string, string> = { username: "username", firstName: "first name", lastName: "last name", netId: "NetID", puid: "PUID" };

export function parsePayload(json: string): Payload {
  try {
    const p = JSON.parse(json);
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

export interface AuditNames {
  participant(id: unknown): { name: string; userId: number } | undefined;
  team(id: unknown): string | undefined;
  user(id: unknown): string | undefined;
  game(id: unknown): string | undefined;
  report(id: unknown): { killer: string; victim: string } | undefined;
}

/** Looks up every player, team, user, game and report the given payloads mention, in one query each. */
export function auditNames(db: DB, payloads: Payload[]): AuditNames {
  const ids = (keys: string[]) => [...new Set(payloads.flatMap((p) => keys.map((k) => p[k]).filter((v): v is number => typeof v === "number")))];
  const pIds = ids(PARTICIPANT_KEYS);
  const tIds = ids(TEAM_KEYS);
  const uIds = ids(["userId"]);
  const gIds = ids(["copyFromGameId"]);
  const rIds = ids(["reportId"]);

  const participantNames = new Map(
    pIds.length
      ? db
          .select({ id: participants.id, name: users.displayName, userId: participants.userId })
          .from(participants)
          .innerJoin(users, eq(users.id, participants.userId))
          .where(inArray(participants.id, pIds))
          .all()
          .map(({ id, ...r }) => [id, r])
      : [],
  );
  const teamNames = new Map(tIds.length ? db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, tIds)).all().map((r) => [r.id, r.name]) : []);
  const userNames = new Map(uIds.length ? db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, uIds)).all().map((r) => [r.id, r.name]) : []);
  const gameNames = new Map(gIds.length ? db.select({ id: games.id, name: games.name }).from(games).where(inArray(games.id, gIds)).all().map((r) => [r.id, r.name]) : []);
  const killerP = aliasedTable(participants, "killer_p");
  const killerU = aliasedTable(users, "killer_u");
  const victimP = aliasedTable(participants, "victim_p");
  const victimU = aliasedTable(users, "victim_u");
  const reports = new Map(
    rIds.length
      ? db
          .select({ id: killReports.id, killer: killerU.displayName, victim: victimU.displayName })
          .from(killReports)
          .innerJoin(killerP, eq(killerP.id, killReports.assassinId))
          .innerJoin(killerU, eq(killerU.id, killerP.userId))
          .innerJoin(victimP, eq(victimP.id, killReports.victimId))
          .innerJoin(victimU, eq(victimU.id, victimP.userId))
          .where(inArray(killReports.id, rIds))
          .all()
          .map(({ id, ...r }) => [id, r])
      : [],
  );
  const get = <T,>(m: Map<number, T>) => (id: unknown) => (typeof id === "number" ? m.get(id) : undefined);
  return { participant: get(participantNames), team: get(teamNames), user: get(userNames), game: get(gameNames), report: get(reports) };
}

export interface AuditEntry {
  action: string;
  payload: Payload;
  actor: string | null; // null = the system
  actorUserId: number | null;
}

/** One audit entry as a sentence, e.g. "Anna removed Bob (reason: inactivity)." */
export function describeAudit({ action, payload: p, actor, actorUserId }: AuditEntry, n: AuditNames): string {
  const a = actor ?? "System";
  const player = (k: string) => n.participant(p[k])?.name ?? "a player who has since left";
  // Payloads written since the audit log got sentences carry names for teams that may be deleted.
  const team = (k: string, nameKey?: string) =>
    p[k] == null ? "unassigned" : (n.team(p[k]) ?? (nameKey && typeof p[nameKey] === "string" ? (p[nameKey] as string) : "a team that no longer exists"));
  const user = () => n.user(p.userId) ?? "a deleted account";
  const report = () => {
    const r = n.report(p.reportId);
    return r ? `${r.killer}'s report on ${r.victim}` : `report #${p.reportId}`;
  };
  const reason = (k: string) => (typeof p[k] === "string" && p[k] ? ` (reason: ${p[k]})` : "");
  const quoted = (k: string) => `"${String(p[k] ?? "")}"`;
  const copies = typeof p.copies === "number" ? ` (${p.copies} copies)` : "";

  switch (action) {
    case "game.create": {
      const from = n.game(p.copyFromGameId);
      return `${a} created the game ${quoted("name")}${from ? `, copying settings from ${from}` : ""}.`;
    }
    case "game.settings":
      return `${a} saved the game settings.`;
    case "game.join_code":
      return `${a} generated a new join code.`;
    case "game.open_registration":
      return `${a} opened registration.`;
    case "game.signups_open":
      return `${a} reopened sign-ups.`;
    case "game.signups_close":
      return `${a} closed sign-ups.`;
    case "game.start":
      return `${a} started the game with ${p.teams} teams and ${p.players} players.`;
    case "game.pause":
      return `${a} paused the game.`;
    case "game.resume":
      return `${a} resumed the game${typeof p.pausedForMs === "number" ? ` after ${fmtDuration(p.pausedForMs)}` : ""}.`;
    case "game.finish":
      return `${a} finished the game${p.winnerTeamId != null ? `, naming ${team("winnerTeamId")} the winner` : ""}.`;
    case "game.won":
      return p.winnerTeamId != null ? `${team("winnerTeamId")} won the game.` : "The game ended with no team left.";
    case "game.delete":
      return `${a} deleted the draft ${quoted("name")}.`;
    case "player.join":
      return `${a} joined the game.`;
    case "player.leave":
      return `${a} left the game.`;
    case "team.create":
      return `${a} created the team ${quoted("name")}.`;
    case "team.join":
      return `${a} joined ${team("teamId")}.`;
    case "team.leave":
      return `${a} left ${team("teamId", "teamName")}.`;
    case "team.rename":
      return `${a} renamed a team to ${quoted("name")}.`;
    case "kill.submit":
      return `${a} reported killing ${player("victimId")}.`;
    case "kill.confirm": {
      const r = n.report(p.reportId);
      return `${a} confirmed ${r ? `${r.killer}'s kill on them` : `report #${p.reportId}`}.`;
    }
    case "kill.dispute":
      return `${a} disputed ${report()}.`;
    case "kill.approve":
      // A victim's confirmation approves the kill on the spot, logged with the victim as the actor.
      if (actorUserId != null && n.participant(p.victimId)?.userId === actorUserId) {
        return `${player("assassinId")}'s kill on ${player("victimId")} was approved automatically after ${player("victimId")} confirmed it.`;
      }
      return `${a} approved ${player("assassinId")}'s kill on ${player("victimId")}.`;
    case "kill.reject":
      return `${a} rejected ${report()}${reason("note")}.`;
    case "kill.stale":
      return `${report()} went stale: ${String(p.problem ?? "")}`;
    case "kill.withdraw":
      return `${a} withdrew their kill report${p.victimId != null ? ` on ${player("victimId")}` : ""}.`;
    case "kill.undo":
      return `${a} undid ${report().replace("'s report on", "'s kill on")}.`;
    case "kill.acknowledge":
      return p.reportId != null ? `${a} marked ${report()} as seen.` : `${a} marked every victim-confirmed kill as seen.`;
    case "admin.move_player":
      return `${a} moved ${player("participantId")} from ${team("from", "fromName")} to ${team("to")}.`;
    case "admin.merge_teams":
      return `${a} merged ${team("fromTeamId", "fromName")} into ${team("intoTeamId")}.`;
    case "admin.auto_fill":
      return `${a} auto-filled ${p.placed} player(s) into teams of ${p.size}.`;
    case "admin.kick_player":
      return `${a} removed ${user()} from the game.`;
    case "admin.remove_player":
      return `${a} removed ${player("participantId")}${reason("reason")}.`;
    case "admin.remove_team":
      return `${a} removed ${team("teamId")}${reason("reason")}.`;
    case "admin.revive":
      return `${a} revived ${player("participantId")}${p.insertBeforeTeamId != null ? `, with their team hunting ${team("insertBeforeTeamId")}` : ""}.`;
    case "admin.reshuffle":
      return `${a} reshuffled the ring (${p.teams} teams).`;
    case "admin.create_user":
      return `${a} created the account for ${user()}.`;
    case "admin.reset_password":
      return `${a} reset ${user()}'s password.`;
    case "admin.update_user": {
      const fields = Array.isArray(p.changed) ? p.changed.flatMap((k) => ACCOUNT_FIELDS[String(k)] ?? []) : [];
      return `${a} edited the account details for ${user()}${fields.length ? ` (${fields.join(", ")})` : ""}.`;
    }
    case "admin.delete_user":
      return `${a} deleted the account for ${typeof p.name === "string" ? p.name : "a player"}${p.anonymized ? " (kept as \"Deleted player\" in past games)" : ""}.`;
    case "admin.promote":
      return `${a} made ${user()} an admin.`;
    case "admin.demote":
      return `${a} removed ${user()}'s admin rights.`;
    case "announcement.create":
      return `${a} posted the ${String(p.kind ?? "")} ${quoted("title")}${copies}.`;
    case "announcement.update":
      return `${a} edited the announcement ${quoted("title")}.`;
    case "announcement.delete":
      return `${a} deleted the announcement ${p.title ? quoted("title") : `#${p.id}`}${copies}.`;
    case "registration.code":
      return `${a} set the account registration code.`;
    case "registration.close":
      return `${a} closed account sign-ups.`;
    default:
      return `${a}: ${action} ${Object.keys(p).length ? JSON.stringify(p) : ""}`.trim();
  }
}
