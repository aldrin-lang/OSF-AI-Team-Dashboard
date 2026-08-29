import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "brand" | "violet" | "cyan" | "orange" | "emerald" | "rose";

const ACCENT: Record<Accent, { grad: string; ring: string; glow: string; text: string }> = {
  brand: {
    grad: "from-brand-400 to-brand-600",
    ring: "ring-brand-400/30",
    glow: "shadow-[0_16px_40px_-18px_rgba(43,127,255,0.7)]",
    text: "text-brand-300",
  },
  violet: {
    grad: "from-violet-400 to-violet-600",
    ring: "ring-violet-400/30",
    glow: "shadow-[0_16px_40px_-18px_rgba(167,139,250,0.7)]",
    text: "text-violet-300",
  },
  cyan: {
    grad: "from-cyan-300 to-cyan-500",
    ring: "ring-cyan-400/30",
    glow: "shadow-[0_16px_40px_-18px_rgba(34,211,238,0.6)]",
    text: "text-cyan-300",
  },
  orange: {
    grad: "from-accent-400 to-accent-600",
    ring: "ring-accent-400/30",
    glow: "shadow-[0_16px_40px_-18px_rgba(242,105,31,0.7)]",
    text: "text-accent-400",
  },
  emerald: {
    grad: "from-emerald-300 to-emerald-500",
    ring: "ring-emerald-400/30",
    glow: "shadow-[0_16px_40px_-18px_rgba(16,185,129,0.6)]",
    text: "text-emerald-300",
  },
  rose: {
    grad: "from-rose-400 to-rose-600",
    ring: "ring-rose-400/30",
    glow: "shadow-[0_16px_40px_-18px_rgba(244,63,94,0.7)]",
    text: "text-rose-300",
  },
};

export function StatTile({
  label,
  value,
  icon: Icon,
  accent = "brand",
  delta,
  href,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  accent?: Accent;
  delta?: number | null;
  href?: string;
  hint?: string;
}) {
  const a = ACCENT[accent];
  const up = (delta ?? 0) >= 0;

  const inner = (
    <div className="glass group relative overflow-hidden rounded-2xl px-5 py-4 transition-transform duration-200 hover:-translate-y-0.5">
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-opacity group-hover:opacity-35",
          a.grad,
        )}
      />
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-b text-white ring-1 ring-inset ring-white/25",
            a.grad,
            a.glow,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        {delta != null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
              up
                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25"
                : "bg-rose-500/15 text-rose-300 ring-rose-400/25",
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-ink">{value}</p>
      <p className="mt-1.5 text-xs text-ink-muted">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
