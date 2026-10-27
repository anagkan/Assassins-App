"use client";

import { useEffect } from "react";

/**
 * Shown instead of Next's bare "Application error" when the page breaks in the browser. That can happen
 * just after a form went through, so say so: retrying blindly could repeat something that already saved.
 */
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-sm pt-8" role="alert">
      <h1 className="h-display mb-2 text-3xl">Something went wrong</h1>
      <p className="mb-4 text-sm text-ink-dim">
        This page hit an error in your browser. If you just submitted something, it has probably already been saved,
        so reload to check before trying again.
      </p>
      <button type="button" className="btn btn-primary w-full" onClick={() => window.location.reload()}>
        Reload page
      </button>
    </div>
  );
}
