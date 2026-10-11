import Link from "next/link";
import { redirect } from "next/navigation";
import { Flash } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { loginAction } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="h-display mb-1 text-4xl">Log in</h1>
      <p className="mb-6 text-sm text-muted">Trust no one.</p>
      <Flash searchParams={sp} />
      <form action={loginAction} className="card space-y-4">
        <div>
          <label className="label" htmlFor="username">Username</label>
          <input className="input" id="username" name="username" autoComplete="username" autoCapitalize="none" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn btn-primary w-full" type="submit">Log in</button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        New this semester? <Link href="/register" className="text-gold underline">Create an account</Link>
        <br />
        Forgot your password? Ask a game admin to reset it.
      </p>
    </div>
  );
}
