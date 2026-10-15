/**
 * Share links (`/join/CODE`, `/team/CODE`) carry their codes through login and sign-up as
 * `?join=` and `?team=` so the dashboard can prefill them. Codes are only ever letters and
 * digits, so anything else is dropped rather than echoed back.
 */
export type Invite = { join?: string; team?: string };

export function cleanCode(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const code = v.trim().toUpperCase();
  return /^[A-Z0-9]{1,20}$/.test(code) ? code : undefined;
}

export function readInvite(src: { join?: unknown; team?: unknown } | FormData): Invite {
  const get = (k: "join" | "team") => (src instanceof FormData ? src.get(k) : src[k]);
  return { join: cleanCode(get("join")), team: cleanCode(get("team")) };
}

/** `?join=…&team=…` (or "" when there's nothing to carry), for appending to a path. */
export function inviteQuery(invite: Invite): string {
  const q = new URLSearchParams();
  if (invite.join) q.set("join", invite.join);
  if (invite.team) q.set("team", invite.team);
  const s = q.toString();
  return s ? `?${s}` : "";
}
