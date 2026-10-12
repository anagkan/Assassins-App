import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash, StatusPill, TabNav } from "@/components/ui";
import { getDb } from "@/db";
import { GameError, getGame } from "@/lib/game";
import { pendingReports } from "@/lib/queries";

export function loadGame(idParam: string) {
  try {
    return getGame(getDb(), Number(idParam));
  } catch (e) {
    if (e instanceof GameError) notFound();
    throw e;
  }
}

export function GameHeader({ id, current, sp }: { id: string; current: string; sp: { ok?: string; error?: string } }) {
  const game = loadGame(id);
  const pending = pendingReports(getDb(), game.id).length;
  const base = `/admin/games/${game.id}`;
  return (
    <>
      <Link href="/admin" className="text-sm text-ink-dim hover:text-ink">← All games</Link>
      <div className="mb-4 mt-1 flex flex-wrap items-baseline gap-3">
        <h1 className="h-display text-3xl">{game.name}</h1>
        <StatusPill status={game.status} />
      </div>
      <TabNav
        current={current}
        items={[
          { href: base, label: "Overview" },
          { href: `${base}/teams`, label: "Teams & players" },
          { href: `${base}/kills`, label: `Kill queue${pending ? ` (${pending})` : ""}` },
          { href: `${base}/ring`, label: "Ring & inactivity" },
          { href: `${base}/announcements`, label: "Announcements" },
        ]}
      />
      <Flash searchParams={sp} />
    </>
  );
}
