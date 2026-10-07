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
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_1px_1px_rgba(15,23,42,0.04),0_10px_28px_-10px_rgba(15,23,42,0.16),0_0_0_1px_rgba(43,127,255,0.08)]",
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
        "flex items-center justify-between border-b border-line px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted",
        className,
      )}
      {...props}
    >
      <span className="h-1 w-1 rounded-full bg-accent-500" />
      {children}
    </h2>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

const fieldBase =
  "w-full rounded-xl border border-line bg-surface text-sm text-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)_inset] placeholder:text-ink-faint transition-colors focus-visible:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500/30 disabled:bg-fill disabled:text-ink-faint";

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
  <select ref={ref} className={cn("h-9 px-2", fieldBase, className)} {...props}>
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
    <div className="rounded-xl border border-dashed border-line-strong bg-fill px-4 py-6 text-center text-sm text-ink-faint">
      {children}
    </div>
  );
}
