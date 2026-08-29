import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_8px_24px_-6px_rgba(43,127,255,0.55),0_1px_0_0_rgba(255,255,255,0.25)_inset] hover:from-brand-300 hover:to-brand-500 hover:shadow-[0_10px_30px_-6px_rgba(43,127,255,0.7)] disabled:opacity-50",
  secondary: "border border-white/12 bg-white/[0.06] text-ink hover:bg-white/[0.12]",
  outline: "border border-white/20 bg-transparent text-ink hover:bg-white/[0.06]",
  ghost: "text-ink-muted hover:bg-white/[0.06] hover:text-ink",
  danger:
    "bg-gradient-to-b from-red-400 to-red-600 text-white shadow-[0_8px_24px_-8px_rgba(239,68,68,0.6)] hover:from-red-300 hover:to-red-500",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  icon: "h-9 w-9",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed active:scale-[0.98]",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
