import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the CRM record pages (VA Managers, Recruitment): status tabs with counts,
 * a search box, page numbers and form field styles. Server components; links keep the other filters.
 */
export const field = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none";
export const fieldSm = "h-8 rounded-lg border border-line bg-surface px-2 text-sm text-ink focus:border-brand-400 focus:outline-none";
export const labelCls = "grid gap-1 text-xs font-semibold text-ink-muted";

export const TONE = {
  blue: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/12 text-red-700 dark:text-red-300",
  green: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  grey: "bg-fill-strong text-ink-muted",
} as const;
export type Tone = keyof typeof TONE;

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", TONE[tone])}>{children}</span>;
}

/** Build a URL for this page keeping the current filters, with some changed (empty values are dropped). */
export function urlFor(base: string, params: Record<string, string>, over: Record<string, string> = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...over })) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

/** Status tabs as cards with counts; the active one is filled. */
export function StatusTabs({
  base,
  params,
  active,
  items,
}: {
  base: string;
  params: Record<string, string>;
  active: string;
  items: { key: string; label: string; count: number; tone: Tone }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <Link
          key={t.key}
          href={urlFor(base, params, { tab: t.key, page: "" })}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold",
            active === t.key ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-ink-muted hover:bg-fill hover:text-ink",
          )}
        >
          {t.label}
          <span className={cn("rounded-full px-1.5 text-xs", active === t.key ? "bg-white/25" : t.count ? TONE[t.tone] : "bg-fill")}>{t.count}</span>
        </Link>
      ))}
    </div>
  );
}

export function SearchBox({ base, params, q, placeholder }: { base: string; params: Record<string, string>; q: string; placeholder: string }) {
  return (
    <form method="get" action={base} className="relative">
      {Object.entries(params).map(([k, v]) => (k === "q" || k === "page" || !v ? null : <input key={k} type="hidden" name={k} value={v} />))}
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="h-9 w-72 rounded-lg border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none"
      />
    </form>
  );
}

export function Pager({ base, params, page, pages }: { base: string; params: Record<string, string>; page: number; pages: number }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2);
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Pages">
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1] > 1 && <span className="text-ink-faint">…</span>}
          <Link
            href={urlFor(base, params, { page: n > 1 ? String(n) : "" })}
            className={cn("rounded-lg border px-3 py-1.5", n === page ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-muted hover:bg-fill")}
          >
            {n}
          </Link>
        </span>
      ))}
    </nav>
  );
}

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

/** Escape % and _ for an ilike search. */
export const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
