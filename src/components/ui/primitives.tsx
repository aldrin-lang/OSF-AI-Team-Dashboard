import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  glow,
  hover,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean; hover?: boolean }) {
  return (
    <div
      className={cn(
        "glass rounded-2xl",
        glow && "card-glow",
        hover &&
          "transition-transform duration-200 hover:-translate-y-0.5 hover:border-white/20",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-white/10 px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-[13px] font-semibold uppercase tracking-wide text-ink-muted", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

const fieldBase =
  "w-full rounded-xl border border-white/12 bg-white/[0.04] text-sm text-ink shadow-inner shadow-black/20 placeholder:text-ink-faint transition-colors focus-visible:border-brand-400 focus-visible:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500/40 disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-9 px-3", fieldBase, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("min-h-[80px] px-3 py-2", fieldBase, className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn("h-9 px-2 [&>option]:bg-navy-900 [&>option]:text-ink", fieldBase, className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1 block text-xs font-medium text-ink-muted", className)}
      {...props}
    />
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-center text-sm text-ink-faint">
      {children}
    </div>
  );
}
