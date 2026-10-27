"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { checkRegistrationCode, createUser, setPassword, verifyLogin } from "@/lib/auth";
import { act, flashRedirect, int, str } from "@/lib/flash";
import * as G from "@/lib/game";
import { inviteQuery, readInvite } from "@/lib/invite";
import { clear, hit, isLimited, rateLimit } from "@/lib/rateLimit";
import { clientIp, endSession, requireUser, startSession } from "@/lib/session";

/** A failed login, returned to the form so it can keep the username filled in. */
export type LoginResult = { error: string; username: string } | null;

export async function loginAction(_prev: LoginResult, fd: FormData): Promise<LoginResult> {
  const username = str(fd, "username");
  const invite = readInvite(fd);
  const ip = await clientIp();
  // Only failed attempts count, so switching between accounts never locks anyone out.
  const ipKey = `login:ip:${ip}`;
  const userKey = `login:user:${username.toLowerCase()}`;
  if (isLimited(ipKey, 20) || isLimited(userKey, 8)) {
    return { error: "Too many failed attempts. Try again in a few minutes.", username };
  }
  const user = await verifyLogin(getDb(), username, str(fd, "password"));
  if (!user) {
    hit(ipKey, 15 * 60_000);
    hit(userKey, 15 * 60_000);
    return { error: "Wrong username or password.", username };
  }
  clear(userKey);
  await startSession(user.id);
  if (user.mustChangePassword) await flashRedirect("/account", "error", "Please choose a new password.");
  redirect(user.isAdmin ? "/admin" : `/${inviteQuery(invite)}`);
}

export async function registerAction(fd: FormData) {
  const ip = await clientIp();
  const q = inviteQuery(readInvite(fd));
  if (!rateLimit(`register:${ip}`, 10, 60 * 60_000)) {
    await flashRedirect(`/register${q}`, "error", "Too many sign-ups from your network. Try later.");
  }
  const db = getDb();
  await act(`/register${q}`, async () => {
    checkRegistrationCode(db, str(fd, "registrationCode"));
    if (str(fd, "password") !== str(fd, "confirm")) throw new G.GameError("Passwords don't match.");
    const firstName = str(fd, "firstName").trim();
    const lastName = str(fd, "lastName").trim();
    const user = await createUser(db, {
      username: str(fd, "username"),
      displayName: `${firstName} ${lastName}`,
      password: str(fd, "password"),
      student: { firstName, lastName, netId: str(fd, "netId"), puid: str(fd, "puid") },
    });
    await startSession(user.id);
    const next = q ? "Welcome! Your account is ready." : "Welcome! Your account is ready. Enter the game's join code to join.";
    await flashRedirect(`/${q}`, "ok", next);
  });
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function joinGameAction(fd: FormData) {
  const user = await requireUser();
  await act("/", () => {
    const db = getDb();
    const gameId = int(fd, "gameId");
    G.joinGame(db, user.id, gameId, str(fd, "joinCode"));
    // Arrived from a team share link: join that team too, so it's one tap instead of two.
    const inviteCode = str(fd, "inviteCode");
    if (!inviteCode) return "You've joined the game!";
    try {
      return `You've joined the game and ${G.joinTeam(db, gameId, user.id, inviteCode).name}.`;
    } catch (e) {
      if (e instanceof G.GameError) return `You've joined the game, but not the team: ${e.message}`;
      throw e;
    }
  }, (m) => m as string);
}

export async function leaveGameAction(fd: FormData) {
  const user = await requireUser();
  await act("/", () => G.leaveGame(getDb(), int(fd, "gameId"), user.id), "You've left the game.");
}

export async function createTeamAction(fd: FormData) {
  const user = await requireUser();
  await act(
    "/",
    () => {
      const db = getDb();
      const gameId = int(fd, "gameId");
      G.createTeam(db, gameId, user.id, str(fd, "name").trim() || user.displayName);
      // A solo game's "team" is just the player, so there's no one to invite.
      return G.getGame(db, gameId).maxTeamSize === 1
        ? "You're locked in. Your target will show up here when the game starts."
        : "Team created. Share the invite code with your teammates.";
    },
    (m) => m as string,
  );
}

export async function joinTeamAction(fd: FormData) {
  const user = await requireUser();
  await act("/", () => G.joinTeam(getDb(), int(fd, "gameId"), user.id, str(fd, "inviteCode")), (t) => `You joined ${(t as { name: string }).name}.`);
}

export async function leaveTeamAction(fd: FormData) {
  const user = await requireUser();
  await act("/", () => G.leaveTeam(getDb(), int(fd, "gameId"), user.id), "You left your team.");
}

export async function renameMyTeamAction(fd: FormData) {
  const user = await requireUser();
  await act("/", () => {
    const db = getDb();
    const gameId = int(fd, "gameId");
    const game = G.getGame(db, gameId);
    if (game.status !== "registration") throw new G.GameError("Team names are locked once the game starts.");
    const me = G.getParticipantForUser(db, gameId, user.id);
    if (!me?.teamId) throw new G.GameError("You're not on a team.");
    G.renameTeam(db, user.id, me.teamId, str(fd, "name"));
  }, "Team renamed.");
}

export async function submitKillAction(fd: FormData) {
  const user = await requireUser();
  await act(
    "/",
    () => {
      const when = str(fd, "occurredAt");
      const occurredAt = when ? new Date(when).getTime() : Date.now();
      if (!Number.isFinite(occurredAt) || occurredAt > Date.now() + 5 * 60_000) throw new G.GameError("Invalid time.");
      return G.submitKill(getDb(), int(fd, "gameId"), user.id, int(fd, "victimId"), {
        occurredAt,
        location: str(fd, "location"),
        description: str(fd, "description"),
      });
    },
    "Kill reported! Your target can confirm it on their dashboard; otherwise an admin will review it.",
  );
}

export async function respondToKillAction(fd: FormData) {
  const user = await requireUser();
  const confirm = str(fd, "response") === "confirm";
  await act(
    "/",
    () => G.respondToKill(getDb(), user.id, int(fd, "reportId"), confirm ? "confirmed" : "disputed", str(fd, "note")),
    (r) =>
      !confirm
        ? "Dispute sent. The admins will look at both sides."
        : (r as { stale: boolean }).stale
          ? "That report no longer applies, so nothing changed."
          : "Kill confirmed. Thanks for playing fair.",
  );
}

export async function withdrawKillAction(fd: FormData) {
  const user = await requireUser();
  await act("/", () => G.withdrawKill(getDb(), user.id, int(fd, "reportId")), "Report withdrawn.");
}

export async function changePasswordAction(fd: FormData) {
  const user = await requireUser();
  await act(
    "/account",
    async () => {
      const db = getDb();
      if (!(await verifyLogin(db, user.username, str(fd, "current")))) throw new G.GameError("Current password is wrong.");
      if (str(fd, "password") !== str(fd, "confirm")) throw new G.GameError("New passwords don't match.");
      await setPassword(db, user.id, str(fd, "password"));
      await startSession(user.id);
    },
    "Password changed.",
  );
}

export async function updateProfileAction(fd: FormData) {
  const user = await requireUser();
  await act(
    "/account",
    async () => {
      const db = getDb();
      const running = G.runningGameFor(db, user.id);
      if (running) throw new G.GameError(`Names are locked while ${running.name} is running. Ask an admin if yours needs changing.`);
      const firstName = str(fd, "firstName").trim().slice(0, 40);
      const lastName = str(fd, "lastName").trim().slice(0, 40);
      if (!firstName || !lastName) throw new G.GameError("Please enter your first and last name.");
      db.update(users).set({ firstName, lastName, displayName: `${firstName} ${lastName}` }).where(eq(users.id, user.id)).run();
    },
    "Profile saved.",
  );
}
