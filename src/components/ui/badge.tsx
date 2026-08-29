import * as React from "react";
import { cn } from "@/lib/utils";
import { TONE_CLASS, type Tone } from "@/lib/labels";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset backdrop-blur-sm",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  );
}
