"use client";

import { useLayoutEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

/** "£1,234.50 paid" → { prefix: "£", n: 1234.5, decimals: 2, grouped: true, suffix: " paid" } */
function parse(text: string) {
  const m = text.match(/^(\D*?)(-?\d[\d,]*(?:\.\d+)?)([\s\S]*)$/);
  if (!m || /\d/.test(m[3])) return null; // dates, ranges, "3/5": show as-is
  const raw = m[2];
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return { prefix: m[1], n, decimals: raw.split(".")[1]?.length ?? 0, grouped: raw.includes(","), suffix: m[3] };
}

/**
 * A number that counts up when it first appears and rolls to its new value
 * when it changes (e.g. after a filter or a live update). Works on plain
 * numbers and on formatted text like "£12,400", "31.2%" or "47 days".
 * Anything it can't read as a number is shown as-is.
 */
export function AnimatedNumber({ value, className }: { value: string | number; className?: string }) {
  const text = String(value);
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef<number | null>(null);
  const reduce = useReducedMotion();

  // layout effect: the first frame already shows the start value, no flash of the final one
  useLayoutEffect(() => {
    const el = ref.current;
    const p = parse(text);
    if (!el || !p) return;
    const fmt = (v: number) =>
      p.prefix +
      v.toLocaleString("en-GB", {
        minimumFractionDigits: p.decimals,
        maximumFractionDigits: p.decimals,
        useGrouping: p.grouped,
      }) +
      p.suffix;
    // Write into React's own text node so React stays in sync with the DOM.
    const show = (t: string) => {
      if (el.firstChild) el.firstChild.nodeValue = t;
      else el.textContent = t;
    };
    const from = last.current ?? 0; // whatever is on screen right now
    if (reduce || from === p.n) {
      last.current = p.n;
      show(text);
      return;
    }
    show(fmt(from));
    const controls = animate(from, p.n, {
      duration: Math.min(1.1, 0.5 + Math.log10(Math.abs(p.n - from) + 1) * 0.15),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        last.current = v;
        show(fmt(v));
      },
      onComplete: () => {
        last.current = p.n;
        show(text); // end on the exact server text
      },
    });
    return () => controls.stop();
  }, [text, reduce]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {text}
    </span>
  );
}
