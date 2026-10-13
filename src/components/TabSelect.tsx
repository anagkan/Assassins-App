"use client";

import { useRouter } from "next/navigation";

/** The phone version of TabNav: a native picker that navigates as soon as a page is chosen. */
export function TabSelect({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Section"
      className="input mb-5 font-semibold sm:hidden"
      value={current}
      onChange={(e) => router.push(e.target.value)}
    >
      {items.map((i) => (
        <option key={i.href} value={i.href}>{i.label}</option>
      ))}
    </select>
  );
}
