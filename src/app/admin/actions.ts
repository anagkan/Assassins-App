"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { ANNOUNCEMENT_KINDS, announcements, users } from "@/db/schema";
import { createUser, resetPassword, setRegistrationCode } from "@/lib/auth";
import { act, int, optInt, str } from "@/lib/flash";
import * as G from "@/lib/game";
import { requireAdmin } from "@/lib/session";
import type { PasswordResult } from "./users/PasswordForm";

const gamePath = (id: number, sub = "") => `/admin/games/${id}${sub}`;

function parseLocal(s: string): number | null {
  if (!s.trim()) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) throw new G.GameError("Invalid date.");
  return t;
}

/** Finish and Reshuffle make the admin type the game's name; check it here too, not just in the browser. */
function requireTypedName(fd: FormData, gameId: number) {
  const game = G.getGame(getDb(), gameId);
  if (str(fd, "confirmName").trim() !== game.name.trim()) throw new G.GameError(`Type the game's name ("${game.name}") to confirm.`);
}

// ---- Games ---------------------------------------------------------------

export async function createGameAction(fd: FormData) {
  const admin = await requireAdmin();
  let id: number;
  try {
    id = G.createGame(getDb(), admin.id, str(fd, "name"), optInt(fd, "copyFrom") ?? undefined).id;
  } catch (e) {
    if (e instanceof G.GameError) redirect("/admin?error=" + encodeURIComponent(e.message));
    throw e;
  }
  redirect(gamePath(id) + "?ok=" + encodeURIComponent("Game created. Review the settings, then open registration."));
}

export async function deleteGameAction(fd: FormData) {
  const admin = await requireAdmin();
  await act("/admin", () => G.deleteDraftGame(getDb(), admin.id, int(fd, "gameId")), "Draft deleted.");
}

export async function updateSettingsAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = int(fd, "gameId");
  await act(
    gamePath(id),
    () => {
      const mode = str(fd, "teamMode");
      const settings: G.GameSettings = {
        name: str(fd, "name"),
        rulesMarkdown: str(fd, "rulesMarkdown"),
        safeZonesMarkdown: str(fd, "safeZonesMarkdown"),
        inactivityDays: optInt(fd, "inactivityDays"),
        showKillerInFeed: str(fd, "showKillerInFeed") === "1",
      };
      if (fd.has("teamMode")) {
        settings.maxTeamSize = mode === "solo" ? 1 : optInt(fd, "maxTeamSize");
        settings.minTeamSize = mode === "solo" ? 1 : (optInt(fd, "minTeamSize") ?? 1);
      }
      G.updateGameSettings(getDb(), admin.id, id, settings);
    },
    "Settings saved.",
  );
}

export async function gameStatusAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = int(fd, "gameId");
  const db = getDb();
  const op = str(fd, "op");
  await act(
    gamePath(id),
    () => {
      switch (op) {
        case "open":
          return G.openRegistration(db, admin.id, id);
        case "opensignups":
          return G.setSignupsOpen(db, admin.id, id, true);
        case "closesignups":
          return G.setSignupsOpen(db, admin.id, id, false);
        case "start":
          return G.startGame(db, admin.id, id);
        case "pause":
          return G.pauseGame(db, admin.id, id);
        case "resume":
          return G.resumeGame(db, admin.id, id);
        case "finish":
          requireTypedName(fd, id);
          return G.finishGame(db, admin.id, id, optInt(fd, "winnerTeamId"));
        case "joincode":
          return G.regenerateJoinCode(db, admin.id, id);
        default:
          throw new G.GameError("Unknown action.");
      }
    },
    (r) =>
      op === "start" && Array.isArray(r) && r.length
        ? `Game started. Note: ${r.join(" ")}`
        : ({ open: "Registration is open.", opensignups: "Sign-ups reopened.", closesignups: "Sign-ups closed. Players already in can still sort out teams.", start: "Game started! Targets assigned.", pause: "Game paused.", resume: "Game resumed.", finish: "Game finished.", joincode: "New join code generated." } as Record<string, string>)[op],
  );
}

// ---- Teams ---------------------------------------------------------------

export async function teamAdminAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = int(fd, "gameId");
  const db = getDb();
  const op = str(fd, "op");
  await act(
    gamePath(id, "/teams"),
    () => {
      switch (op) {
        case "move": {
          const to = str(fd, "to");
          return G.movePlayer(db, admin.id, int(fd, "participantId"), to === "new" ? "new" : to === "" ? null : Number(to));
        }
        case "rename":
          return G.renameTeam(db, admin.id, int(fd, "teamId"), str(fd, "name"));
        case "merge":
          return G.mergeTeams(db, admin.id, int(fd, "teamId"), int(fd, "intoTeamId"));
        case "autofill":
          return G.autoFillTeams(db, admin.id, id, int(fd, "size"));
        case "removePlayer":
          return G.removePlayer(db, admin.id, int(fd, "participantId"), str(fd, "reason"));
        case "removeTeam":
          return G.removeTeam(db, admin.id, int(fd, "teamId"), str(fd, "reason"));
        case "revive":
          return G.reviveParticipant(db, admin.id, int(fd, "participantId"), optInt(fd, "beforeTeamId") ?? undefined);
        case "kick": {
          const pid = int(fd, "participantId");
          const p = db.query.participants.findFirst({ where: (p, { eq }) => eq(p.id, pid) }).sync();
          if (!p) throw new G.GameError("Player not found.");
          return G.leaveGame(db, id, p.userId);
        }
        default:
          throw new G.GameError("Unknown action.");
      }
    },
    (r) => (op === "autofill" ? `Placed ${r} player(s).` : "Done."),
  );
}

// ---- Kills ---------------------------------------------------------------

export async function reviewKillAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = int(fd, "gameId");
  const db = getDb();
  const approve = str(fd, "decision") === "approve";
  await act(
    gamePath(id, "/kills"),
    () => (approve ? G.approveKill(db, admin.id, int(fd, "reportId"), str(fd, "note") || undefined) : G.rejectKill(db, admin.id, int(fd, "reportId"), str(fd, "note"))),
    (r) => (approve ? ((r as { stale: boolean }).stale ? "That report was out of date and has been marked stale." : "Kill approved.") : "Kill rejected."),
  );
}

export async function acknowledgeKillAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = int(fd, "gameId");
  const reportId = str(fd, "reportId") ? int(fd, "reportId") : undefined;
  await act(gamePath(id, "/kills"), () => G.acknowledgeConfirmedKills(getDb(), admin.id, id, reportId));
}

// ---- Ring & inactivity -----------------------------------------------------

export async function reshuffleAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = int(fd, "gameId");
  await act(
    gamePath(id, "/ring"),
    () => {
      requireTypedName(fd, id);
      return G.reshuffleAlive(getDb(), admin.id, id);
    },
    "Ring reshuffled. Everyone has a new target.",
  );
}

export async function purgeInactiveAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = int(fd, "gameId");
  const ids = fd.getAll("teamId").map((v) => Number(v)).filter(Number.isFinite);
  await act(gamePath(id, "/ring"), () => G.purgeInactive(getDb(), admin.id, id, ids), (n) => `Purged ${n} team(s).`);
}

// ---- Announcements ---------------------------------------------------------

export async function announcementAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = int(fd, "gameId");
  const db = getDb();
  await act(
    gamePath(id, "/announcements"),
    () => {
      if (str(fd, "op") === "delete") {
        db.delete(announcements).where(and(eq(announcements.id, int(fd, "announcementId")), eq(announcements.gameId, id))).run();
        G.audit(db, admin.id, id, "announcement.delete", { id: int(fd, "announcementId") });
        return;
      }
      const kind = str(fd, "kind") as (typeof ANNOUNCEMENT_KINDS)[number];
      if (!ANNOUNCEMENT_KINDS.includes(kind)) throw new G.GameError("Invalid type.");
      const title = str(fd, "title").trim().slice(0, 200);
      if (!title) throw new G.GameError("Title is required.");
      const activeFrom = parseLocal(str(fd, "activeFrom")) ?? Date.now();
      const activeUntil = parseLocal(str(fd, "activeUntil"));
      if (activeUntil != null && activeUntil <= activeFrom) throw new G.GameError("End must be after start.");
      db.insert(announcements)
        .values({ gameId: id, kind, title, body: str(fd, "body").slice(0, 2000), activeFrom, activeUntil, createdBy: admin.id, createdAt: Date.now() })
        .run();
      G.audit(db, admin.id, id, "announcement.create", { kind, title });
    },
    "Saved.",
  );
}

// ---- Registration ----------------------------------------------------------

export async function registrationAction(fd: FormData) {
  const admin = await requireAdmin();
  const op = str(fd, "op");
  await act(
    "/admin/registration",
    () => {
      switch (op) {
        case "generate":
          return setRegistrationCode(getDb(), admin.id);
        case "set":
          return setRegistrationCode(getDb(), admin.id, str(fd, "code"));
        case "close":
          return setRegistrationCode(getDb(), admin.id, null);
        default:
          throw new G.GameError("Unknown action.");
      }
    },
    op === "close" ? "Account sign-ups closed." : "Registration code saved.",
  );
}

// ---- Users -----------------------------------------------------------------

export async function userAdminAction(fd: FormData) {
  const admin = await requireAdmin();
  const db = getDb();
  const op = str(fd, "op");
  await act(
    "/admin/users",
    () => {
      const userId = int(fd, "userId");
      if (op !== "promote" && op !== "demote") throw new G.GameError("Unknown action.");
      if (op === "demote") {
        if (userId === admin.id) throw new G.GameError("You can't remove your own admin rights.");
        const others = db.select().from(users).where(and(eq(users.isAdmin, true), ne(users.id, userId))).all();
        if (others.length === 0) throw new G.GameError("There must be at least one admin.");
      }
      db.update(users).set({ isAdmin: op === "promote" }).where(eq(users.id, userId)).run();
      G.audit(db, admin.id, null, `admin.${op}`, { userId });
    },
    "Done.",
  );
}

/** Reset a password or create an account. Returns the temporary password rather than redirecting with it. */
export async function userPasswordAction(_prev: PasswordResult, fd: FormData): Promise<PasswordResult> {
  const admin = await requireAdmin();
  const db = getDb();
  try {
    if (str(fd, "op") === "create") {
      const password = `${G.randomCode(4)}-${G.randomCode(4)}`.toLowerCase();
      const u = await createUser(db, { username: str(fd, "username"), displayName: str(fd, "displayName"), password });
      db.update(users).set({ mustChangePassword: true }).where(eq(users.id, u.id)).run();
      G.audit(db, admin.id, null, "admin.create_user", { userId: u.id });
      revalidatePath("/admin/users");
      return { ok: true, message: `Created @${u.username}.`, password };
    }
    const password = await resetPassword(db, admin.id, int(fd, "userId"));
    return { ok: true, message: "Password reset.", password };
  } catch (e) {
    if (e instanceof G.GameError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
