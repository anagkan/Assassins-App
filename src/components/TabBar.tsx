"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Paths drawn with a 24px grid, stroked in currentColor. */
const icons: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  feed: <path d="M4 6h16M4 12h16M4 18h10" />,
  standings: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />,
  rules: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" />,
  me: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />,
};

const tabs = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/feed", label: "Feed", icon: "feed" },
  { href: "/leaderboard", label: "Standings", icon: "standings" },
  { href: "/rules", label: "Rules", icon: "rules" },
  { href: "/account", label: "Me", icon: "me", also: ["/history"] },
];

/** Bottom navigation for phones. Wider screens use the header links instead. */
export function TabBar() {
  const path = usePathname();
  const isCurrent = (t: (typeof tabs)[number]) =>
    t.href === "/" ? path === "/" : [t.href, ...(t.also ?? [])].some((p) => path === p || path.startsWith(`${p}/`));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {tabs.map((t) => {
          const current = isCurrent(t);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[0.7rem] font-semibold ${current ? "text-accent" : "text-ink-dim"}`}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {icons[t.icon]}
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
