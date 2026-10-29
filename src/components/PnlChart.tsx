"use client";

import { useRef, useState } from "react";
import { formatMoney } from "@/lib/odds/convert";

export interface PnlPoint {
  label: string;
  actual: number;
  expected: number;
}

const SERIES = [
  { key: "actual" as const, name: "Actual profit", color: "var(--color-series-1)" },
  { key: "expected" as const, name: "Expected profit (EV)", color: "var(--color-series-2)" },
];

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** Cumulative actual vs expected profit across settled bets. One axis, both in dollars. */
export function PnlChart({ points }: { points: PnlPoint[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const height = 240;
  const m = { top: 12, right: 112, bottom: 26, left: 56 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const all = [0, ...points.flatMap((p) => [p.actual, p.expected])];
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const x = (i: number) => m.left + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => m.top + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const path = (k: "actual" | "expected") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg || !points.length) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = points.length <= 1 ? 0 : Math.round(((px - m.left) / iw) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const hp = hover !== null ? points[hover] : null;
  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-2 text-xs text-ink-2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden>
              <line x1="0" x2="16" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {s.name}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          role="img"
          aria-label={last ? `Actual profit ${formatMoney(last.actual)}, expected ${formatMoney(last.expected)} over ${points.length} settled bets` : "No settled bets"}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-ink-3)" className="tnum">
                {t < 0 ? "-" : ""}${Math.abs(t) >= 1000 ? `${(Math.abs(t) / 1000).toFixed(1)}K` : Math.abs(t).toFixed(0)}
              </text>
            </g>
          ))}
          <line x1={m.left} x2={m.left + iw} y1={y(0)} y2={y(0)} stroke="var(--color-line-2)" strokeWidth={1} />
          <text x={m.left} y={height - 6} fontSize="11" fill="var(--color-ink-3)">
            First bet
          </text>
          <text x={m.left + iw} y={height - 6} fontSize="11" fill="var(--color-ink-3)" textAnchor="end">
            {points.length} settled
          </text>
          {SERIES.map((s) => (
            <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {last
            ? SERIES.map((s) => (
                <g key={s.key}>
                  <circle cx={x(points.length - 1)} cy={y(last[s.key])} r={4} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />
                  <text x={x(points.length - 1) + 10} y={y(last[s.key])} dy="0.32em" fontSize="11" fill="var(--color-ink-2)" className="tnum">
                    {formatMoney(last[s.key])}
                  </text>
                </g>
              ))
            : null}
          {hp && hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} stroke="var(--color-ink-3)" strokeWidth={1} />
              {SERIES.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(hp[s.key])} r={4} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />
              ))}
            </g>
          ) : null}
        </svg>
        {hp && hover !== null ? (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-xs shadow-xl"
            style={{ left: `${(x(hover) / width) * 100}%`, transform: hover > points.length / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
          >
            <p className="text-ink-3 mb-1 max-w-48 truncate">{hp.label}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-2">
                <svg width="12" height="6" aria-hidden>
                  <line x1="0" x2="12" y1="3" y2="3" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="font-semibold text-ink tnum">{formatMoney(hp[s.key])}</span>
                <span className="text-ink-3">{s.name}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
