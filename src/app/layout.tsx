import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import crest from "@/assets/crest.png";
import { getCurrentUser } from "@/lib/session";
import { TabBar } from "@/components/TabBar";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Colonial Assassins",
  description: "The Colonial Club Assassins game.",
};

export const viewport: Viewport = { themeColor: "#000985", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-surface">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-2 sm:py-3">
            <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap text-[1.15rem] font-[650] tracking-[0.01em] text-club">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={crest.src} alt="" width={40} height={40} className="size-9 rounded-full sm:size-10 bg-navy object-contain p-1" />
              Colonial Assassins
            </Link>
            {user && (
              <nav className="ml-auto hidden items-center gap-3 text-sm text-ink-dim sm:flex">
                <Link href="/feed" className="hover:text-ink">Feed</Link>
                <Link href="/leaderboard" className="hover:text-ink">Standings</Link>
                <Link href="/rules" className="hover:text-ink">Rules</Link>
                <Link href="/history" className="hover:text-ink">History</Link>
                {user.isAdmin && <Link href="/admin" className="hover:text-ink">Admin</Link>}
                <Link href="/account" className="hover:text-ink">Profile</Link>
                <form action={logoutAction}>
                  <button className="hover:text-ink" type="submit">Log out</button>
                </form>
              </nav>
            )}
            {user?.isAdmin && (
              <Link href="/admin" className="ml-auto text-sm text-ink-dim hover:text-ink sm:hidden">Admin</Link>
            )}
          </div>
        </header>
        <main className={`mx-auto max-w-4xl px-4 py-6 ${user ? "pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-6" : ""}`}>{children}</main>
        {user && <TabBar />}
      </body>
    </html>
  );
}
