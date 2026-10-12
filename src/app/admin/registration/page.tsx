import { Flash, PageTitle } from "@/components/ui";
import { getDb } from "@/db";
import { getRegistrationCode } from "@/lib/auth";
import { AdminNav } from "../AdminNav";
import { registrationAction } from "../actions";

export default async function RegistrationAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const code = getRegistrationCode(getDb());
  return (
    <>
      <PageTitle sub="Who can create an account. Joining a game uses that game's own join code.">Registration</PageTitle>
      <AdminNav current="/admin/registration" />
      <Flash searchParams={sp} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <div className="label">Registration code</div>
          {code ? (
            <>
              <div className="font-mono text-2xl tracking-[0.3em] text-gold">{code}</div>
              <p className="text-xs text-muted">New players need this to create an account. Share it with the club.</p>
            </>
          ) : (
            <p className="text-sm">
              <b className="text-blood">Account sign-ups are closed.</b>{" "}
              <span className="text-muted">Generate or set a code to let new players create accounts.</span>
            </p>
          )}
          <form action={registrationAction} className="flex flex-wrap gap-2">
            <button name="op" value="generate" className="btn btn-sm btn-primary">{code ? "Regenerate" : "Generate code"}</button>
            {code && <button name="op" value="close" className="btn btn-sm btn-danger">Close account sign-ups</button>}
          </form>
        </div>
        <form action={registrationAction} className="card space-y-3">
          <input type="hidden" name="op" value="set" />
          <label className="label" htmlFor="code">Set a custom code</label>
          <input className="input uppercase" id="code" name="code" required pattern="[A-Za-z0-9]{4,20}" title="4–20 letters or numbers" autoCapitalize="characters" />
          <p className="text-xs text-muted">4–20 letters or numbers. Not case-sensitive for players.</p>
          <button className="btn btn-sm">Save code</button>
        </form>
      </div>
    </>
  );
}
