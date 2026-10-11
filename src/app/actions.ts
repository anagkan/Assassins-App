"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createUser, setPassword, verifyLogin } from "@/lib/auth";
import { act, int, str } from "@/lib/flash";
import * as G from "@/lib/game";
import { deletePhoto, savePhoto } from "@/lib/photos";
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
    const game = G.getCurrentGame(db);
    if (!game || game.status !== "registration") throw new G.GameError("Sign-ups are closed right now.");
    if (str(fd, "joinCode").trim().toUpperCase() !== game.joinCode) throw new G.GameError("That join code is wrong.");
    if (str(fd, "password") !== str(fd, "confirm")) throw new G.GameError("Passwords don't match.");
    const user = await createUser(db, {
      username: str(fd, "username"),
      displayName: str(fd, "displayName"),
      password: str(fd, "password"),
    });
    G.joinGame(db, user.id, game.id, game.joinCode);
    await startSession(user.id);
    redirect("/?ok=" + encodeURIComponent("Welcome! You're in. Now create or join a team."));
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
    "Kill reported! An admin will review it soon.",
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
      const displayName = str(fd, "displayName").trim().slice(0, 60);
      if (!displayName) throw new G.GameError("Name can't be empty.");
      const updates: { displayName: string; photoPath?: string | null } = { displayName };
      const photo = fd.get("photo");
      if (photo instanceof File && photo.size > 0) {
        updates.photoPath = await savePhoto(photo);
        deletePhoto(user.photoPath);
      } else if (str(fd, "removePhoto") === "1") {
        updates.photoPath = null;
        deletePhoto(user.photoPath);
      }
      db.update(users).set(updates).where(eq(users.id, user.id)).run();
    },
    "Profile saved.",
  );
}
