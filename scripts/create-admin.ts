/**
 * Emergency admin access. Creates a new admin, or promotes an existing user and resets
 * their password.
 *   npm run create-admin -- <username> <password>
 * In Docker:  docker compose exec app node scripts/create-admin.mjs <username> <password>
 */
import path from "node:path";
import { eq } from "drizzle-orm";
import { openDb } from "../src/db";
import { users } from "../src/db/schema";
import { createUser, normalizeUsername, setPassword } from "../src/lib/auth";

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: create-admin <username> <password>");
    process.exit(1);
  }
  const db = openDb(path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "assassins.db"));
  const existing = db.select().from(users).where(eq(users.username, normalizeUsername(username))).get();
  if (existing) {
    await setPassword(db, existing.id, password);
    db.update(users).set({ isAdmin: true }).where(eq(users.id, existing.id)).run();
    console.log(`Promoted "${existing.username}" to admin and reset their password.`);
  } else {
    await createUser(db, { username, displayName: username, password, isAdmin: true });
    console.log(`Created admin "${normalizeUsername(username)}".`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
