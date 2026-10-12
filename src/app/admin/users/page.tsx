import { asc } from "drizzle-orm";
import { Flash, PageTitle, fmtDate } from "@/components/ui";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { AdminNav } from "../AdminNav";
import { userAdminAction } from "../actions";

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").toLowerCase();
  const all = getDb().select().from(users).orderBy(asc(users.displayName)).all();
  const rows = q ? all.filter((u) => [u.username, u.displayName.toLowerCase(), u.netId, u.puid].some((f) => f?.includes(q))) : all;

  return (
    <>
      <PageTitle sub="Reset forgotten passwords and hand admin rights to next year's officers.">Users</PageTitle>
      <AdminNav current="/admin/users" />
      <Flash searchParams={sp} />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <form className="card flex gap-2" action="/admin/users">
          <input className="input" name="q" defaultValue={sp.q} placeholder="Search name, username, NetID or PUID" />
          <button className="btn">Search</button>
        </form>
        <form action={userAdminAction} className="card flex flex-wrap gap-2">
          <input type="hidden" name="op" value="create" />
          <input className="input flex-1" name="displayName" placeholder="Name" required />
          <input className="input flex-1" name="username" placeholder="username" required />
          <button className="btn">Create account</button>
        </form>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Username</th><th>NetID</th><th>PUID</th><th>Joined</th><th>Role</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.displayName}</td>
                <td className="text-ink-dim">@{u.username}</td>
                <td>{u.netId ?? <span className="text-ink-dim">—</span>}</td>
                <td className="font-mono">{u.puid ?? <span className="text-ink-dim">—</span>}</td>
                <td className="whitespace-nowrap text-ink-dim">{fmtDate(u.createdAt)}</td>
                <td>{u.isAdmin ? <span className="pill chip-info">admin</span> : "player"}</td>
                <td className="flex flex-wrap justify-end gap-1">
                  <form action={userAdminAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button name="op" value="reset" className="btn btn-sm">Reset password</button>
                  </form>
                  {u.id !== me.id && (
                    <form action={userAdminAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button name="op" value={u.isAdmin ? "demote" : "promote"} className="btn btn-sm">
                        {u.isAdmin ? "Remove admin" : "Make admin"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
