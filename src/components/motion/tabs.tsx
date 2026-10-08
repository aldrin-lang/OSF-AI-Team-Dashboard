"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; href: string; label: React.ReactNode };

const SPRING = { type: "spring" as const, stiffness: 500, damping: 40, mass: 0.8 };

/**
 * Page tabs whose highlight slides to the one you click straight away,
 * while the page loads the new view behind it.
 *  - "underline": the line under the active tab glides across
 *  - "pill": the filled pill glides behind the active tab
 */
export function Tabs({
  items,
  active,
  variant = "underline",
  className,
}: {
  items: TabItem[];
  active: string;
  variant?: "underline" | "pill";
  className?: string;
}) {
  const id = useId();
  const [picked, setPicked] = useState(active);
  const [shown, setShown] = useState(active);
  // follow the server when the view changes some other way (back button, links)
  if (shown !== active) {
    setShown(active);
    setPicked(active);
  }

  if (variant === "pill") {
    return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {items.map((t) => {
          const on = t.key === picked;
          return (
            <Link
              key={t.key}
              href={t.href}
              onClick={() => setPicked(t.key)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
                on ? "text-white" : "bg-fill text-ink-muted hover:text-ink",
              )}
            >
              {on && <motion.span layoutId={`pill-${id}`} transition={SPRING} className="absolute inset-0 rounded-full bg-brand-500 shadow-[0_6px_16px_-8px_rgba(43,127,255,0.7)]" />}
              <span className="relative">{t.label}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2 overflow-x-auto border-b border-line text-sm", className)}>
      {items.map((t) => {
        const on = t.key === picked;
        return (
          <Link
            key={t.key}
            href={t.href}
            onClick={() => setPicked(t.key)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap px-3 py-2 font-medium transition-colors duration-200",
              on ? "text-ink" : "text-ink-faint hover:text-ink-muted",
            )}
          >
            {t.label}
            {on && (
              <motion.span
                layoutId={`line-${id}`}
                transition={SPRING}
                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand-500"
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
