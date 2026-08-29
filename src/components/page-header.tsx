import * as React from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="h-5 w-1 rounded-full bg-gradient-to-b from-brand-400 to-accent-500" />
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        </div>
        {subtitle && <p className="mt-1.5 pl-[14px] text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
