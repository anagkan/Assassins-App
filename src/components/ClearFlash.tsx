"use client";

import { useEffect } from "react";
import { FLASH_COOKIE } from "@/lib/flashCookie";

/** Deletes the flash cookie once its message is on screen, so a refresh or later visit doesn't show it again. */
export function ClearFlash({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  }, [id]);
  return null;
}
