import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, lt } from "drizzle-orm";
import type { DB } from "@/db";
import { sessions, settings, users, type User } from "@/db/schema";
import { GameError, audit, randomCode } from "./game";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;
const NETID_RE = /^[a-z]{2}[0-9]{4}$/;
const PUID_RE = /^[0-9]{9}$/;

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
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
  const username = normalizeUsername(input.username);
  if (!USERNAME_RE.test(username)) {
    throw new GameError("Username must be 3–32 characters: letters, numbers, dot, dash or underscore.");
  }
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
