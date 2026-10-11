import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games, type Game } from "@/db/schema";
import { getCurrentGame } from "./game";

/** Resolve ?game=<id> for public pages (only non-draft games), defaulting to the current game. */
export function resolveGame(param?: string): Game | undefined {
  const db = getDb();
  const id = param ? Number(param) : NaN;
  if (Number.isFinite(id)) {
    const g = db.select().from(games).where(eq(games.id, id)).get();
    if (g && g.status !== "draft") return g;
  }
  return getCurrentGame(db);
}
