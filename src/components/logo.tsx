import { cn } from "@/lib/utils";

/** OutsourceForce.ai reticle mark — navy + blue broken rings, orange centre. */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {/* outer navy ring, split into 4 arcs by N/E/S/W gaps */}
      <g fill="none" strokeLinecap="butt">
        <circle cx="50" cy="50" r="42" stroke="#14284d" strokeWidth="10" strokeDasharray="55 10.9" strokeDashoffset="27.5" />
        {/* inner bright-blue ring */}
        <circle cx="50" cy="50" r="30" stroke="#2b7fff" strokeWidth="9" strokeDasharray="39.3 7.8" strokeDashoffset="19.6" />
      </g>
      {/* orange centre */}
      <circle cx="50" cy="50" r="11" fill="none" stroke="#f2691f" strokeWidth="7" />
    </svg>
  );
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Logo size={26} />
      <span className="text-[15px] font-semibold leading-none tracking-tight text-ink">
        OutsourceForce<span className="text-brand-400">.ai</span>
      </span>
    </div>
  );
}
