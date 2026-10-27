"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { Invite } from "@/lib/invite";
import { loginAction } from "../actions";

/** The login form. A failed attempt shows its error here and keeps the username, so only the password needs retyping. */
export function LoginForm({ invite }: { invite: Invite }) {
  const [result, formAction] = useActionState(loginAction, null);
  return (
    <>
      {result && (
        <div role="alert" className="mb-4 rounded-sm bg-stop px-4 py-3 text-sm text-stop-ink">
          {result.error}
        </div>
      )}
      <form action={formAction} className="card space-y-4">
        {invite.join && <input type="hidden" name="join" value={invite.join} />}
        {invite.team && <input type="hidden" name="team" value={invite.team} />}
        <div>
          <label className="label" htmlFor="username">Username</label>
          <input className="input" id="username" name="username" autoComplete="username" autoCapitalize="none" required defaultValue={result?.username} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton className="btn btn-primary w-full" pendingLabel="Logging in…">Log in</SubmitButton>
      </form>
    </>
  );
}
