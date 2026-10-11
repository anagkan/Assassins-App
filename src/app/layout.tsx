import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Colonial Assassins",
  description: "The Colonial Club Assassins game.",
};

export const viewport: Viewport = { themeColor: "#0e0d0c", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-ink/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
            <Link href="/" className="h-display text-lg font-bold whitespace-nowrap">
              <span className="text-blood">✕</span> Colonial Assassins
            </Link>
            {user && (
              <nav className="ml-auto flex items-center gap-3 overflow-x-auto text-sm text-muted">
                <Link href="/feed" className="hover:text-bone">Feed</Link>
                <Link href="/leaderboard" className="hover:text-bone">Standings</Link>
                <Link href="/rules" className="hover:text-bone">Rules</Link>
                <Link href="/history" className="hidden hover:text-bone sm:inline">History</Link>
                {user.isAdmin && <Link href="/admin" className="text-gold hover:text-bone">Admin</Link>}
                <Link href="/account" className="hover:text-bone" title="Account">{user.displayName.split(" ")[0]}</Link>
                <form action={logoutAction}>
                  <button className="hover:text-bone" type="submit">Log out</button>
                </form>
              </nav>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
