import type { Metadata } from "next";
import { Empty, PageTitle } from "@/components/ui";
import { renderMarkdown } from "@/lib/markdown";
import { requireUser } from "@/lib/session";
import { resolveGame } from "@/lib/viewGame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Rules" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  await requireUser();
  const game = resolveGame((await searchParams).game);
  if (!game) return <PageTitle>No games yet</PageTitle>;
  const teamText =
    game.maxTeamSize === 1
      ? "Solo game: every player is on their own."
      : `Team game: teams of ${game.minTeamSize > 1 ? `${game.minTeamSize}–` : "up to "}${game.maxTeamSize ?? "any size"}. Any member of your team can eliminate any member of your target team. A team is out when all its members are out, and the team that finished them off inherits their target.`;
  return (
    <>
      <PageTitle sub={teamText}>Rules · {game.name}</PageTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card md:col-span-2">
          <h2 className="h-display mb-3 text-xl">Rules</h2>
          {game.rulesMarkdown ? (
            <div className="prose-rules" dangerouslySetInnerHTML={{ __html: renderMarkdown(game.rulesMarkdown) }} />
          ) : (
            <Empty>The admins haven&apos;t posted rules yet.</Empty>
          )}
        </section>
        <section className="card self-start">
          <h2 className="h-display mb-3 text-xl">Safe zones</h2>
          {game.safeZonesMarkdown ? (
            <div className="prose-rules text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(game.safeZonesMarkdown) }} />
          ) : (
            <Empty>None posted.</Empty>
          )}
          {game.inactivityDays && (
            <p className="mt-4 border-t border-line pt-3 text-sm text-ink-dim">
              Inactivity: {game.maxTeamSize === 1 ? "players" : "teams"} without a kill for {game.inactivityDays} day
              {game.inactivityDays === 1 ? "" : "s"} may be purged.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
