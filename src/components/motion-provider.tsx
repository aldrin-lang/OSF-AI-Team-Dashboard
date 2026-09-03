"use client";

import { MotionConfig } from "motion/react";

/**
 * App-wide motion defaults. `reducedMotion="user"` makes every Motion
 * animation respect the OS "reduce motion" setting automatically.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 400, damping: 40 }}>
      {children}
    </MotionConfig>
  );
}
