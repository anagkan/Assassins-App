"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Keys that move a closed select's value without the user choosing anything yet. */
const BROWSE_KEYS = /^(Arrow(Up|Down|Left|Right)|Home|End|Page(Up|Down)|[^ ])$/;

/**
 * The phone version of TabNav: a native picker. Choosing from the picker navigates straight away,
 * but browsing a closed select with the keyboard only moves the selection; Enter goes there.
 */
export function TabSelect({ items, current, label }: { items: { href: string; label: string }[]; current: string; label: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const browsing = useRef(false);
  useEffect(() => setValue(current), [current]);
  const go = (href: string) => {
    if (href !== current) router.push(href);
  };
  return (
    <select
      aria-label={label}
      className="input mb-5 font-semibold sm:hidden"
      value={value}
      onKeyDown={(e) => {
        browsing.current = BROWSE_KEYS.test(e.key);
        if (e.key === "Enter") go(e.currentTarget.value);
      }}
      onChange={(e) => {
        setValue(e.target.value);
        if (!browsing.current) go(e.target.value);
        browsing.current = false;
      }}
      onBlur={() => setValue(current)}
    >
      {items.map((i) => (
        <option key={i.href} value={i.href}>{i.label}</option>
      ))}
    </select>
  );
}
