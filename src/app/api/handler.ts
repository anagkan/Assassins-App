import { getDb, type DB } from "@/db";
import { authorized } from "@/lib/api";
import { GameError } from "@/lib/game";

type Params = Record<string, string>;
type Ctx = { params: Promise<Params> };

/** Check the bearer token, run `fn`, and turn its result (or a GameError) into a JSON response. */
export function apiRoute(fn: (db: DB, req: Request, params: Params) => unknown) {
  return async (req: Request, ctx: Ctx) => {
    if (!authorized(req.headers.get("authorization"))) return Response.json({ error: "Unauthorized." }, { status: 401 });
    try {
      return Response.json(await fn(getDb(), req, await ctx.params));
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      // Lookups throw "Game not found." / "Announcement not found."; everything else is bad input.
      return Response.json({ error: e.message }, { status: /not found/i.test(e.message) ? 404 : 400 });
    }
  };
}

/** The request's JSON body; a malformed one becomes a 400. */
export async function jsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new GameError("Request body must be valid JSON.");
  }
}

/** A numeric id from the URL; anything else can't match a row, so it's a 404 like a missing one. */
export function idParam(params: Params, key: string, what: string): number {
  const n = Number(params[key]);
  if (!Number.isInteger(n) || n < 1) throw new GameError(`${what} not found.`);
  return n;
}
