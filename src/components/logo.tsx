import { cn } from "@/lib/utils";

/** One ring segment from angle a0 to a1 (degrees, 0 = east, clockwise), centred on 50,50. */
function arc(r: number, a0: number, a1: number) {
  const pt = (a: number) => `${(50 + r * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(50 + r * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
  return `M ${pt(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1)}`;
}
// thin straight cuts at N/E/S/W (half-gap angle at each ring's radius)
const NAVY = [0, 1, 2, 3].map((q) => arc(44, q * 90 + 2.7, q * 90 + 90 - 2.7));
// the blue ring has no bottom-right quarter
const BLUE = [1, 2, 3].map((q) => arc(34.6, q * 90 + 3.5, q * 90 + 90 - 3.5));

/** OutsourceForce.ai mark: navy ring in four quarters, blue ring in three (none bottom-right), orange centre ring. */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <g fill="none" strokeLinecap="butt">
        {NAVY.map((d) => (
          <path key={d} d={d} stroke="#14284d" strokeWidth="10" />
        ))}
        {BLUE.map((d) => (
          <path key={d} d={d} stroke="#247df5" strokeWidth="8.8" />
        ))}
      </g>
      <circle cx="50" cy="50" r="10.8" fill="none" stroke="#ec6e0a" strokeWidth="5" />
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
