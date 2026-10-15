import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FLASH_COOKIE } from "./flashCookie";
import { GameError } from "./game";

/**
 * Redirect to `path` with a message for the next page. The message rides in a short-lived cookie,
 * not the URL, so it doesn't come back on refresh, end up in shared links, or sit in history.
 */
export async function flashRedirect(path: string, kind: "ok" | "error", msg: string): Promise<never> {
  (await cookies()).set(FLASH_COOKIE, JSON.stringify({ kind, msg, id: randomUUID() }), {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: 60,
  });
  redirect(path);
}

/**
 * Run a mutation and redirect back to `path` with a flash message (see `flashRedirect`). GameErrors become
 * user-visible error messages; anything else is logged and shown generically.
 */
export async function act(path: string, fn: () => unknown | Promise<unknown>, okMessage?: string | ((r: unknown) => string)) {
  let msg: string;
  let kind: "ok" | "error";
  try {
    const result = await fn();
    kind = "ok";
    msg = typeof okMessage === "function" ? okMessage(result) : (okMessage ?? "");
  } catch (e) {
    if (isRedirect(e)) throw e;
    kind = "error";
    if (e instanceof GameError) msg = e.message;
    else {
      console.error(e);
      msg = "Something went wrong. Please try again.";
    }
  }
  if (msg) await flashRedirect(path, kind, msg);
  redirect(path);
}

function isRedirect(e: unknown) {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function int(fd: FormData, key: string): number {
  const n = Number.parseInt(str(fd, key), 10);
  if (!Number.isFinite(n)) throw new GameError(`Missing ${key}.`);
  return n;
}

export function optInt(fd: FormData, key: string): number | null {
  const s = str(fd, key).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n)) throw new GameError(`Invalid ${key}.`);
  return n;
}
