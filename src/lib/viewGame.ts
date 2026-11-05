import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games, type Game, type User } from "@/db/schema";
import { canViewGame, getCurrentGameFor } from "./game";

/** Resolve ?game=<id> for public pages (only games this user may see), defaulting to the game this user should see. */
export function resolveGame(user: User, param?: string): Game | undefined {
  const db = getDb();
  const id = param ? Number(param) : NaN;
  if (Number.isFinite(id)) {
    const g = db.select().from(games).where(eq(games.id, id)).get();
    if (g && canViewGame(db, g, user)) return g;
  }
  return getCurrentGameFor(db, user);
}
