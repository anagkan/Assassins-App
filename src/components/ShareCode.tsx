"use client";

import { useState } from "react";

/**
 * A "Share link" button for a code's share link (`path`, e.g. `/join/ABC123`). Uses the phone's
 * share sheet where there is one, otherwise copies the link.
 */
export function ShareCode({ path, title, className = "btn btn-sm" }: { path: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
          try {
            await navigator.share({ title, url });
            return;
          } catch (e) {
            if ((e as Error).name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", url);
        }
      }}
    >
      <span aria-live="polite">{copied ? "Link copied" : "Share link"}</span>
    </button>
  );
}
