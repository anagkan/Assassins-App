import Link from "next/link";
import type { ReactNode } from "react";

export function Flash({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  if (searchParams.error) {
    return (
      <div role="alert" className="mb-4 rounded-lg border border-blood bg-blood-dim/30 px-4 py-3 text-sm">
        {searchParams.error}
      </div>
    );
  }
  if (searchParams.ok) {
    return (
      <div role="status" className="mb-4 rounded-lg border border-ok bg-ok/15 px-4 py-3 text-sm">
        {searchParams.ok}
      </div>
    );
  }
  return null;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="h-display text-3xl sm:text-4xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Avatar({ name, photo, size = 48, dead }: { name: string; photo: string | null; size?: number; dead?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const cls = `shrink-0 rounded-full border border-line object-cover ${dead ? "grayscale opacity-50" : ""}`;
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/photos/${photo}`} alt={name} width={size} height={size} className={cls} style={{ width: size, height: size }} />;
  }
  return (
    <div
      className={`${cls} flex items-center justify-center bg-panel-2 font-semibold text-muted`}
      style={{ width: size, height: size, fontSize: size / 2.8 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    alive: "border-ok text-ok",
    eliminated: "border-blood text-blood",
    purged: "border-muted text-muted",
    pending: "border-gold text-gold",
    approved: "border-ok text-ok",
    rejected: "border-blood text-blood",
    stale: "border-muted text-muted",
    registration: "border-gold text-gold",
    active: "border-ok text-ok",
    paused: "border-gold text-gold",
    finished: "border-muted text-muted",
    draft: "border-muted text-muted",
  };
  const label = status === "purged" ? "removed" : status;
  return <span className={`pill ${styles[status] ?? "border-line text-muted"}`}>{label}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function TabNav({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto pb-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
            current === i.href ? "bg-panel-2 text-bone" : "text-muted hover:text-bone"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
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

export function fmtRelative(ms: number, now = Date.now()) {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3_600_000);
  const d = Math.floor(h / 24);
  const text = d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${Math.floor((abs % 3_600_000) / 60_000)}m` : `${Math.max(1, Math.floor(abs / 60_000))}m`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
