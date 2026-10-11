import "server-only";
import { redirect } from "next/navigation";
import { GameError } from "./game";

/**
 * Run a mutation and redirect back to `path` with a flash message. GameErrors become
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
  const sep = path.includes("?") ? "&" : "?";
  redirect(msg ? `${path}${sep}${kind}=${encodeURIComponent(msg)}` : path);
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
