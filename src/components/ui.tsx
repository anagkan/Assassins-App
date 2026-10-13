import Link from "next/link";
import type { ReactNode } from "react";
import { TabSelect } from "./TabSelect";

export function Flash({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  if (searchParams.error) {
    return (
      <div role="alert" className="mb-4 rounded-sm bg-stop px-4 py-3 text-sm text-stop-ink">
        {searchParams.error}
      </div>
    );
  }
  if (searchParams.ok) {
    return (
      <div role="status" className="mb-4 rounded-sm bg-ok px-4 py-3 text-sm text-(--ok-chip-ink)">
        {searchParams.ok}
      </div>
    );
  }
  return null;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="h-display break-words text-3xl sm:text-4xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-ink-dim">{sub}</p>}
    </div>
  );
}

export function Avatar({ name, size = 48, dead }: { name: string; size?: number; dead?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={`shrink-0 ${size >= 64 ? "rounded-lg" : "rounded-sm"} border border-line ${dead ? "opacity-50" : ""} flex items-center justify-center bg-surface-sunken font-semibold text-ink-dim`}
      style={{ width: size, height: size, fontSize: size / 2.8 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    alive: "chip-ok",
    eliminated: "chip-stop",
    purged: "chip-neutral",
    pending: "chip-warn",
    approved: "chip-ok",
    rejected: "chip-stop",
    stale: "chip-neutral",
    registration: "chip-info",
    active: "chip-ok",
    paused: "chip-warn",
    finished: "chip-neutral",
    draft: "chip-neutral",
  };
  const label = status === "purged" ? "removed" : status;
  return <span className={`pill ${styles[status] ?? "chip-neutral"}`}>{label}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-dim">{children}</p>;
}

export function TabNav({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <>
      <TabSelect items={items} current={current} />
      <nav className="-mx-1 mb-5 hidden gap-1 overflow-x-auto pb-1 sm:flex">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`whitespace-nowrap rounded-control border px-3 py-1.5 text-sm ${
              current === i.href ? "border-accent bg-surface font-semibold text-ink" : "border-transparent text-ink-dim hover:border-line hover:text-ink"
            }`}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function fmtDate(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.TZ || "America/New_York",
  });
}

/** A length of time, e.g. "2d 3h", "4h 10m" or "5m". */
export function fmtDuration(ms: number) {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const d = Math.floor(h / 24);
  return d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${Math.floor((abs % 3_600_000) / 60_000)}m` : `${Math.max(1, Math.floor(abs / 60_000))}m`;
}

export function fmtRelative(ms: number, now = Date.now()) {
  const diff = ms - now;
  return diff >= 0 ? `in ${fmtDuration(diff)}` : `${fmtDuration(diff)} ago`;
}
