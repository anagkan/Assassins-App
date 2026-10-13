import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, lt, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { games, participants, sessions, settings, users, type User } from "@/db/schema";
import { GameError, audit, deleteTeamIfEmpty, randomCode } from "./game";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;
const NETID_RE = /^[a-z]{2}[0-9]{4}$/;
const PUID_RE = /^[0-9]{9}$/;

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
}

function validUsername(u: string): string {
  const username = normalizeUsername(u);
  if (!USERNAME_RE.test(username)) {
    throw new GameError("Username must be 3–32 characters: letters, numbers, dot, dash or underscore.");
  }
  return username;
}

export function validatePassword(pw: string) {
  if (pw.length < 8) throw new GameError("Password must be at least 8 characters.");
  if (pw.length > 200) throw new GameError("Password is too long.");
}

export type StudentInfo = { firstName: string; lastName: string; netId: string; puid: string };

/** Validate and normalize the student fields collected at sign-up. */
export function normalizeStudentInfo(input: StudentInfo): StudentInfo {
  const firstName = input.firstName.trim().slice(0, 40);
  const lastName = input.lastName.trim().slice(0, 40);
  if (!firstName || !lastName) throw new GameError("Please enter your first and last name.");
  const netId = input.netId.trim().toLowerCase();
  if (!NETID_RE.test(netId)) throw new GameError("NetID must be 2 letters followed by 4 numbers (e.g. ab1234).");
  const puid = input.puid.trim();
  if (!PUID_RE.test(puid)) throw new GameError("PUID must be exactly 9 digits.");
  return { firstName, lastName, netId, puid };
}

export async function createUser(
  db: DB,
  input: { username: string; displayName: string; password: string; isAdmin?: boolean; student?: StudentInfo },
): Promise<User> {
  const username = validUsername(input.username);
  const displayName = input.displayName.trim().slice(0, 60);
  if (!displayName) throw new GameError("Please enter your name.");
  const student = input.student && normalizeStudentInfo(input.student);
  validatePassword(input.password);
  if (db.select().from(users).where(eq(users.username, username)).get()) {
    throw new GameError("That username is taken.");
  }
  if (student && db.select().from(users).where(eq(users.netId, student.netId)).get()) {
    throw new GameError("An account with that NetID already exists. Try logging in.");
  }
  if (student && db.select().from(users).where(eq(users.puid, student.puid)).get()) {
    throw new GameError("An account with that PUID already exists. Try logging in.");
  }
  const passwordHash = await bcrypt.hash(input.password, 12);
  return db
    .insert(users)
    .values({ username, displayName, ...student, passwordHash, isAdmin: input.isAdmin ?? false, createdAt: Date.now() })
    .returning()
    .get();
}

// ---- Admin account management ---------------------------------------------

export type AccountInfo = { username: string; firstName: string; lastName: string; netId: string; puid: string };

/** Admin edit of an account. NetID and PUID may be blank, since admin-created accounts have none. */
export function updateAccount(db: DB, actorId: number, userId: number, input: AccountInfo) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new GameError("Account not found.");
  const username = validUsername(input.username);
  const firstName = input.firstName.trim().slice(0, 40);
  const lastName = input.lastName.trim().slice(0, 40);
  if (!firstName) throw new GameError("Please enter a first name.");
  const netId = input.netId.trim().toLowerCase() || null;
  if (netId && !NETID_RE.test(netId)) throw new GameError("NetID must be 2 letters followed by 4 numbers (e.g. ab1234).");
  const puid = input.puid.trim() || null;
  if (puid && !PUID_RE.test(puid)) throw new GameError("PUID must be exactly 9 digits.");
  const takenBy = (col: typeof users.username | typeof users.netId | typeof users.puid, value: string | null) =>
    value != null && db.select({ id: users.id }).from(users).where(and(eq(col, value), ne(users.id, userId))).get();
  if (takenBy(users.username, username)) throw new GameError("That username is taken.");
  if (takenBy(users.netId, netId)) throw new GameError("Another account already has that NetID.");
  if (takenBy(users.puid, puid)) throw new GameError("Another account already has that PUID.");

  const next = { username, firstName, lastName: lastName || null, displayName: [firstName, lastName].filter(Boolean).join(" "), netId, puid };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== user[k]);
  if (!changed.length) return;
  db.transaction((tx) => {
    tx.update(users).set(next).where(eq(users.id, userId)).run();
    audit(tx, actorId, null, "admin.update_user", { userId, changed });
  });
}

/**
 * Admin deletes an account. Someone who has played in a started game is anonymized instead,
 * so kill feeds and past games stay intact; anyone else is removed outright, along with any
 * registration-phase sign-ups. Players still alive in a running game must be removed from it first.
 */
export async function deleteAccount(db: DB, actorId: number, userId: number): Promise<"deleted" | "anonymized"> {
  if (userId === actorId) throw new GameError("You can't delete your own account.");
  // Hashed up front: bcrypt is async and the transaction below is synchronous.
  const unusableHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
  return db.transaction((tx) => {
    const user = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw new GameError("Account not found.");
    const rows = tx
      .select({ p: participants, game: games })
      .from(participants)
      .innerJoin(games, eq(games.id, participants.gameId))
      .where(eq(participants.userId, userId))
      .all();
    const alive = rows.find((r) => (r.game.status === "active" || r.game.status === "paused") && r.p.status === "alive");
    if (alive) throw new GameError(`They're still alive in ${alive.game.name}. Remove them from the game on its Teams page first.`);
    for (const r of rows) {
      if (r.game.status !== "registration") continue;
      tx.delete(participants).where(eq(participants.id, r.p.id)).run();
      deleteTeamIfEmpty(tx, r.p.teamId);
    }
    const played = rows.some((r) => r.game.status !== "registration");
    if (played) {
      tx.update(users)
        .set({
          username: `deleted-${randomCode(8).toLowerCase()}`,
          displayName: "Deleted player",
          firstName: null,
          lastName: null,
          netId: null,
          puid: null,
          passwordHash: unusableHash,
          isAdmin: false,
          mustChangePassword: false,
        })
        .where(eq(users.id, userId))
        .run();
      tx.delete(sessions).where(eq(sessions.userId, userId)).run();
    } else {
      tx.delete(users).where(eq(users.id, userId)).run();
    }
    // The name goes in the payload because the account it pointed at is gone.
    audit(tx, actorId, null, "admin.delete_user", { userId, name: user.displayName, anonymized: played });
    return played ? "anonymized" : "deleted";
  });
}

// ---- Registration code ------------------------------------------------------
// Needed to create an account. Separate from each game's join code, which players
// enter afterwards to join a specific game. No code set = account sign-ups closed.

const REGISTRATION_CODE_KEY = "registration_code";
const REGISTRATION_CODE_RE = /^[A-Z0-9]{4,20}$/;

export function getRegistrationCode(db: DB): string | null {
  return db.select().from(settings).where(eq(settings.key, REGISTRATION_CODE_KEY)).get()?.value ?? null;
}

/** Set the registration code (random if none given), or pass null to close account sign-ups. */
export function setRegistrationCode(db: DB, actorId: number | null, code?: string | null): string | null {
  let value: string | null;
  if (code === null) {
    value = null;
  } else {
    value = code === undefined ? randomCode(6) : code.trim().toUpperCase();
    if (!REGISTRATION_CODE_RE.test(value)) throw new GameError("Registration code must be 4–20 letters or numbers.");
  }
  db.transaction((tx) => {
    if (value === null) tx.delete(settings).where(eq(settings.key, REGISTRATION_CODE_KEY)).run();
    else tx.insert(settings).values({ key: REGISTRATION_CODE_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
    audit(tx, actorId, null, value === null ? "registration.close" : "registration.code", {});
  });
  return value;
}

export function checkRegistrationCode(db: DB, input: string) {
  const code = getRegistrationCode(db);
  if (!code) throw new GameError("Account sign-ups are closed right now.");
  if (input.trim().toUpperCase() !== code) throw new GameError("That registration code is wrong.");
}

let dummyHash: string | undefined;

export async function verifyLogin(db: DB, username: string, password: string): Promise<User | null> {
  const user = db.select().from(users).where(eq(users.username, normalizeUsername(username))).get();
  // Compare against a dummy hash when the user doesn't exist to keep timing similar.
  dummyHash ??= bcrypt.hashSync("not-a-real-password", 12);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  return ok && user ? user : null;
}

export async function setPassword(db: DB, userId: number, password: string, mustChange = false) {
  validatePassword(password);
  const passwordHash = await bcrypt.hash(password, 12);
  db.update(users).set({ passwordHash, mustChangePassword: mustChange }).where(eq(users.id, userId)).run();
  // Log out every other session for this user.
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/** Admin reset: returns a temporary password the player must change on next login. */
export async function resetPassword(db: DB, actorId: number, userId: number): Promise<string> {
  const temp = `${randomCode(4)}-${randomCode(4)}`.toLowerCase();
  await setPassword(db, userId, temp, true);
  audit(db, actorId, null, "admin.reset_password", { userId });
  return temp;
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function createSession(db: DB, userId: number): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();
  db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
  return { token, expiresAt };
}

export function userForToken(db: DB, token: string): User | null {
  const row = db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, hashToken(token)))
    .get();
  if (!row || row.expiresAt < Date.now()) return null;
  return row.user;
}

export function deleteSession(db: DB, token: string) {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

/** Create the first admin from env vars if no admin exists yet. */
export async function bootstrapAdmin(db: DB) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;
  if (db.select().from(users).where(eq(users.isAdmin, true)).get()) return;
  const existing = db.select().from(users).where(eq(users.username, normalizeUsername(username))).get();
  if (existing) {
    db.update(users).set({ isAdmin: true }).where(eq(users.id, existing.id)).run();
  } else {
    await createUser(db, { username, displayName: "Admin", password, isAdmin: true });
  }
  console.log(`[assassins] Bootstrapped admin account "${username}".`);
}
