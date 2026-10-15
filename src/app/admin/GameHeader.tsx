import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { StatusPill, TabNav } from "@/components/ui";
import { getDb } from "@/db";
import { GameError, getGame } from "@/lib/game";
import { pendingReports, unseenConfirmedReports } from "@/lib/queries";

export function loadGame(idParam: string) {
  try {
    return getGame(getDb(), Number(idParam));
  } catch (e) {
    if (e instanceof GameError) notFound();
    throw e;
  }
}

/** Page title for one of a game's admin tabs, e.g. "Kill queue · Spring 2027". */
export function gameMetadata(tab: string) {
  return async ({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> => ({
    title: `${tab} · ${loadGame((await params).id).name}`,
  });
}

export function GameHeader({ id, current }: { id: string; current: string }) {
  const game = loadGame(id);
  const db = getDb();
  // Victim-confirmed kills count too, until an admin marks them seen.
  const pending = pendingReports(db, game.id).length + unseenConfirmedReports(db, game.id).length;
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
        label="Game sections"
        items={[
          { href: base, label: "Overview" },
          { href: `${base}/teams`, label: "Teams & players" },
          { href: `${base}/kills`, label: `Kill queue${pending ? ` (${pending})` : ""}` },
          { href: `${base}/ring`, label: "Ring & inactivity" },
          { href: `${base}/announcements`, label: "Announcements" },
        ]}
      />
      <Flash />
    </>
  );
}
