import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import crest from "@/assets/crest.png";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Colonial Assassins",
  description: "The Colonial Club Assassins game.",
};

export const viewport: Viewport = { themeColor: "#000985", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-surface">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap text-[1.15rem] font-[650] tracking-[0.01em] text-club">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={crest.src} alt="" width={40} height={40} className="size-10 rounded-full bg-navy object-contain p-1" />
              Colonial Assassins
            </Link>
            {user && (
              <nav className="ml-auto flex items-center gap-3 overflow-x-auto text-sm text-ink-dim">
                <Link href="/feed" className="hover:text-ink">Feed</Link>
                <Link href="/leaderboard" className="hover:text-ink">Standings</Link>
                <Link href="/rules" className="hover:text-ink">Rules</Link>
                <Link href="/history" className="hidden hover:text-ink sm:inline">History</Link>
                {user.isAdmin && <Link href="/admin" className="hover:text-ink">Admin</Link>}
                <Link href="/account" className="hover:text-ink" title="Account">{user.displayName.split(" ")[0]}</Link>
                <form action={logoutAction}>
                  <button className="hover:text-ink" type="submit">Log out</button>
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
