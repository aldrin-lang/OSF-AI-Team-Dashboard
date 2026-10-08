import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/motion/animated-number";

type Accent = "brand" | "violet" | "cyan" | "orange" | "emerald" | "rose";

const ACCENT: Record<Accent, { grad: string; glow: string; blob: string }> = {
  brand: {
    grad: "from-brand-400 to-brand-600",
    glow: "shadow-[0_12px_28px_-12px_rgba(43,127,255,0.5)]",
    blob: "from-brand-400 to-brand-500",
  },
  violet: {
    grad: "from-violet-400 to-violet-600",
    glow: "shadow-[0_12px_28px_-12px_rgba(139,92,246,0.45)]",
    blob: "from-violet-400 to-violet-500",
  },
  cyan: {
    grad: "from-cyan-300 to-cyan-500",
    glow: "shadow-[0_12px_28px_-12px_rgba(34,211,238,0.45)]",
    blob: "from-cyan-300 to-cyan-400",
  },
  orange: {
    grad: "from-accent-400 to-accent-600",
    glow: "shadow-[0_12px_28px_-12px_rgba(242,105,31,0.5)]",
    blob: "from-accent-400 to-accent-500",
  },
  emerald: {
    grad: "from-emerald-300 to-emerald-500",
    glow: "shadow-[0_12px_28px_-12px_rgba(16,185,129,0.45)]",
    blob: "from-emerald-300 to-emerald-400",
  },
  rose: {
    grad: "from-rose-400 to-rose-600",
    glow: "shadow-[0_12px_28px_-12px_rgba(244,63,94,0.45)]",
    blob: "from-rose-400 to-rose-500",
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
    <div className="glass group relative overflow-hidden rounded-2xl px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong">
      <div
        className={cn(
          "pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-gradient-to-br opacity-[0.12] blur-2xl transition-opacity group-hover:opacity-20",
          a.blob,
        )}
      />
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-b text-white ring-1 ring-inset ring-white/30",
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
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-rose-50 text-rose-600 ring-rose-200",
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-ink">
        {typeof value === "string" || typeof value === "number" ? <AnimatedNumber value={value} /> : value}
      </p>
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
