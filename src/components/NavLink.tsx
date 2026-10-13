"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/** A header link that tells screen readers when it points at the page you're on (or a page below it). */
export function NavLink({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const path = usePathname();
  const current = path === href || path.startsWith(`${href}/`);
  return <Link href={href} aria-current={current ? "page" : undefined} {...props} />;
}
