"use client";

import { useState } from "react";

/**
 * Last N game values as columns with the prop line drawn across. Columns that
 * clear the line are highlighted, the rest stay gray, so the hit rate reads at
 * a glance. Values arrive newest first and are drawn oldest to newest.
 */
export function HitChart({ values, dates, line, unit }: { values: number[]; dates: string[]; line: number; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  const series = values.slice(0, 10).reverse();
  const when = dates.slice(0, 10).reverse();
  if (!series.length) return null;
  const width = 180;
  const height = 56;
  const pad = 2;
  const slot = width / series.length;
  const barW = Math.min(14, slot - 2);
  const max = Math.max(line * 1.25, ...series, 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const lineY = y(line);
  const r = Math.min(4, barW / 2);
  const hits = series.filter((v) => v > line).length;
  const label = (i: number) => {
    const d = when[i] ? new Date(when[i]) : null;
    const day = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString([], { month: "short", day: "numeric" }) : `Game ${i + 1}`;
    return `${day}: ${series[i]} ${unit}`;
  };
  return (
    <div className="w-[180px]">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Cleared ${line} in ${hits} of the last ${series.length} games`}
        onMouseLeave={() => setActive(null)}
      >
        {series.map((v, i) => {
          const x = i * slot + (slot - barW) / 2;
          const top = y(Math.max(v, 0));
          const h = height - pad - top;
          const over = v > line;
          // Rounded data end, square at the baseline.
          const path =
            h <= r
              ? `M${x},${height - pad} h${barW} v${-Math.max(h, 1)} h${-barW} Z`
              : `M${x},${height - pad} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} Z`;
          return (
            <g key={i}>
              <path d={path} fill={over ? "var(--color-series-1)" : "var(--color-muted-bar)"} opacity={active === null || active === i ? 1 : 0.55} />
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
                tabIndex={0}
                aria-label={label(i)}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              />
            </g>
          );
        })}
        <line x1={0} x2={width} y1={lineY} y2={lineY} stroke="var(--color-ink-2)" strokeWidth={1} />
      </svg>
      <p className="h-4 text-[11px] text-ink-2 tnum">{active !== null ? label(active) : `Line ${line} · blue = over`}</p>
    </div>
  );
}
