"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { checkRegistrationCode, createUser, setPassword, verifyLogin } from "@/lib/auth";
import { act, int, str } from "@/lib/flash";
import * as G from "@/lib/game";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp, endSession, requireUser, startSession } from "@/lib/session";

export async function loginAction(fd: FormData) {
  const username = str(fd, "username");
  const ip = await clientIp();
  if (!rateLimit(`login:ip:${ip}`, 20, 15 * 60_000) || !rateLimit(`login:user:${username.toLowerCase()}`, 8, 15 * 60_000)) {
    redirect(`/login?error=${encodeURIComponent("Too many attempts. Try again in a few minutes.")}`);
  }
  const user = await verifyLogin(getDb(), username, str(fd, "password"));
  if (!user) redirect(`/login?error=${encodeURIComponent("Wrong username or password.")}`);
  await startSession(user.id);
  redirect(user.mustChangePassword ? "/account?error=" + encodeURIComponent("Please choose a new password.") : "/");
}

export async function registerAction(fd: FormData) {
  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, 10, 60 * 60_000)) {
    redirect(`/register?error=${encodeURIComponent("Too many sign-ups from your network. Try later.")}`);
  }
  const db = getDb();
  await act("/register", async () => {
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
    redirect("/?ok=" + encodeURIComponent("Welcome! Your account is ready. Enter the game's join code to join."));
  });
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function joinGameAction(fd: FormData) {
  const user = await requireUser();
  await act("/", () => G.joinGame(getDb(), user.id, int(fd, "gameId"), str(fd, "joinCode")), "You've joined the game!");
}

export async function leaveGameAction(fd: FormData) {
  const user = await requireUser();
  await act("/", () => G.leaveGame(getDb(), int(fd, "gameId"), user.id), "You've left the game.");
}

export async function createTeamAction(fd: FormData) {
  const user = await requireUser();
  await act("/", () => G.createTeam(getDb(), int(fd, "gameId"), user.id, str(fd, "name").trim() || user.displayName), "Team created. Share the invite code with your teammates.");
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
      const firstName = str(fd, "firstName").trim().slice(0, 40);
      const lastName = str(fd, "lastName").trim().slice(0, 40);
      if (!firstName || !lastName) throw new G.GameError("Please enter your first and last name.");
      db.update(users).set({ firstName, lastName, displayName: `${firstName} ${lastName}` }).where(eq(users.id, user.id)).run();
    },
    "Profile saved.",
  );
}
