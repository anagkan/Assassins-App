import { cookies } from "next/headers";
import { FLASH_COOKIE, parseFlash } from "@/lib/flashCookie";
import { ClearFlash } from "./ClearFlash";

/** The message left by the last action's redirect (see `flashRedirect`). Shown once: the browser clears it on display. */
export async function Flash() {
  const flash = parseFlash((await cookies()).get(FLASH_COOKIE)?.value);
  if (!flash) return null;
  const error = flash.kind === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={error ? "mb-4 rounded-sm bg-stop px-4 py-3 text-sm text-stop-ink" : "mb-4 rounded-sm bg-ok px-4 py-3 text-sm text-(--ok-chip-ink)"}
    >
      {flash.msg}
      <ClearFlash id={flash.id} />
    </div>
  );
}
