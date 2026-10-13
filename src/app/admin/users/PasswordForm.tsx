"use client";

import { useActionState, type ReactNode } from "react";

export type PasswordResult = { ok: true; message: string; password: string } | { ok: false; message: string } | null;

/**
 * A form whose action returns a temporary password. It's shown once, in the page, instead of
 * travelling through a redirect URL where it would land in history and access logs.
 */
export function PasswordForm({
  action,
  className,
  children,
}: {
  action: (prev: PasswordResult, fd: FormData) => Promise<PasswordResult>;
  className?: string;
  children: ReactNode;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  return (
    <>
      <form action={formAction} className={className} aria-busy={pending}>
        {children}
      </form>
      {result &&
        (result.ok ? (
          <div role="status" className="basis-full rounded-sm bg-ok px-3 py-2 text-left text-sm text-(--ok-chip-ink)">
            {result.message} Temporary password: <b className="select-all font-mono">{result.password}</b>
            <div className="text-xs">Share it privately; they&apos;ll be asked to change it. It won&apos;t be shown again.</div>
          </div>
        ) : (
          <div role="alert" className="basis-full rounded-sm bg-stop px-3 py-2 text-left text-sm text-stop-ink">
            {result.message}
          </div>
        ))}
    </>
  );
}
