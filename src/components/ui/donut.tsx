import * as React from "react";

const PALETTE = [
  "#2b7fff", "#22d3ee", "#a78bfa", "#f2691f", "#34d399", "#f472b6", "#facc15", "#60a5fa",
];

export function Donut({
  data,
  size = 168,
  thickness = 20,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: React.ReactNode;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(15,23,42,0.07)"
            strokeWidth={thickness}
          />
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const seg = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 6px rgba(43,127,255,0.25))" }}
              />
            );
            offset += dash;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-ink">{centerValue ?? total}</span>
          {centerLabel && <span className="text-[11px] text-ink-faint">{centerLabel}</span>}
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="text-ink-muted">{d.label}</span>
            <span className="ml-auto font-medium text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
