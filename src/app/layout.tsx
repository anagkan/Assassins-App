import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import crest from "@/assets/crest.png";
import { getCurrentUser } from "@/lib/session";
import { NavLink } from "@/components/NavLink";
import { TabBar } from "@/components/TabBar";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: { default: "Colonial Assassins", template: "%s · Colonial Assassins" },
  description: "The Colonial Club Assassins game.",
};

export const viewport: Viewport = { themeColor: "#000985", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only z-20 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-10 border-b border-line bg-surface">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-2 sm:py-3">
            <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap text-[1.15rem] font-[650] tracking-[0.01em] text-club">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={crest.src} alt="" width={40} height={40} className="size-9 rounded-full sm:size-10 bg-navy object-contain p-1" />
              Colonial Assassins
            </Link>
            {user && (
              <nav aria-label="Main" className="ml-auto hidden items-center gap-3 text-sm text-ink-dim sm:flex">
                <NavLink href="/feed" className="hover:text-ink aria-[current=page]:text-ink">Feed</NavLink>
                <NavLink href="/leaderboard" className="hover:text-ink aria-[current=page]:text-ink">Standings</NavLink>
                <NavLink href="/rules" className="hover:text-ink aria-[current=page]:text-ink">Rules</NavLink>
                <NavLink href="/history" className="hover:text-ink aria-[current=page]:text-ink">History</NavLink>
                {user.isAdmin && <NavLink href="/admin" className="hover:text-ink aria-[current=page]:text-ink">Admin</NavLink>}
                <NavLink href="/account" className="hover:text-ink aria-[current=page]:text-ink">Profile</NavLink>
                <form action={logoutAction}>
                  <button className="hover:text-ink" type="submit">Log out</button>
                </form>
              </nav>
            )}
            {user?.isAdmin && (
              <NavLink href="/admin" className="ml-auto text-sm text-ink-dim hover:text-ink aria-[current=page]:text-ink sm:hidden">Admin</NavLink>
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1} className={`outline-none mx-auto max-w-4xl px-4 py-6 ${user ? "pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-6" : ""}`}>{children}</main>
        {user && <TabBar />}
      </body>
    </html>
  );
}
