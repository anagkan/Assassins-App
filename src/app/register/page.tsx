import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash } from "@/components/ui";
import { getDb } from "@/db";
import { getRegistrationCode } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { registerAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; code?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  const open = getRegistrationCode(getDb()) != null;
  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="h-display mb-1 text-4xl">Sign up</h1>
      <p className="mb-6 text-sm text-ink-dim">
        {open ? "Create your account, then join this semester's game from your dashboard." : "Account sign-ups are closed right now."}
      </p>
      <Flash searchParams={sp} />
      {open && (
        <form action={registerAction} className="card space-y-4">
          <div>
            <label className="label" htmlFor="registrationCode">Registration code</label>
            <input className="input uppercase" id="registrationCode" name="registrationCode" defaultValue={sp.code} required autoCapitalize="characters" />
            <p className="mt-1 text-xs text-ink-dim">Get this from the club officers.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="firstName">First name</label>
              <input className="input" id="firstName" name="firstName" autoComplete="given-name" required maxLength={40} />
            </div>
            <div>
              <label className="label" htmlFor="lastName">Last name</label>
              <input className="input" id="lastName" name="lastName" autoComplete="family-name" required maxLength={40} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="netId">NetID</label>
            <input className="input" id="netId" name="netId" placeholder="ab1234" autoCapitalize="none" required pattern="[A-Za-z]{2}[0-9]{4}" maxLength={6} title="2 letters followed by 4 numbers" />
          </div>
          <div>
            <label className="label" htmlFor="puid">PUID</label>
            <input className="input" id="puid" name="puid" inputMode="numeric" required pattern="[0-9]{9}" maxLength={9} title="9 digits" />
            <p className="mt-1 text-xs text-ink-dim">Only visible to admins.</p>
          </div>
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input className="input" id="username" name="username" autoComplete="username" autoCapitalize="none" required pattern="[A-Za-z0-9_.\-]{3,32}" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <SubmitButton className="btn btn-primary w-full" pendingLabel="Creating account…">Create account</SubmitButton>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-ink-dim">
        Played before? <Link href="/login" className="text-accent underline">Log in</Link> and join from your dashboard.
      </p>
    </div>
  );
}
