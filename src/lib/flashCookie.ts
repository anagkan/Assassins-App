export const FLASH_COOKIE = "flash";

export type FlashMessage = { kind: "ok" | "error"; msg: string; id: string };

export function parseFlash(raw: string | undefined): FlashMessage | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FlashMessage>;
    if ((v.kind === "ok" || v.kind === "error") && typeof v.msg === "string" && v.msg && typeof v.id === "string") return v as FlashMessage;
  } catch {}
  return null;
}
