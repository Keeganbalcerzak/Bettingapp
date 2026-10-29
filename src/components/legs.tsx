"use client";

import { Activity, BarChart3, CloudRain, Cross, Gauge, Hourglass, LineChart, Plus, Scale, Check, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { toggleLeg, useSlip } from "@/lib/client/slip";
import { gameLabel } from "@/lib/legs";
import { formatPct, formatPoint, probToAmerican } from "@/lib/odds/convert";
import type { AnalyzedLeg, Signal } from "@/lib/types";
import { cn, ConfidenceMeter, EvBadge, useOdds } from "./ui";

export function useInSlip() {
  const slip = useSlip();
  const ids = new Set(slip.legs.map((l) => l.id));
  return (id: string) => ids.has(id);
}

export function formatStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  if (tomorrow) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

export function shortLine(leg: AnalyzedLeg): string {
  if (leg.market === "spreads") return formatPoint(leg.point);
  if (leg.market === "totals") return `${leg.side === "over" ? "O" : "U"} ${leg.point}`;
  if (leg.market === "h2h") return leg.side === "draw" ? "Draw" : "ML";
  return leg.point !== null && leg.point !== undefined ? `${leg.side === "over" ? "O" : "U"} ${leg.point}` : leg.side === "yes" ? "Yes" : "No";
}

/** A sportsbook style price cell. Tap to add or remove from the slip. */
export function PriceButton({ leg, showLine = true, className }: { leg: AnalyzedLeg | undefined; showLine?: boolean; className?: string }) {
  const inSlip = useInSlip();
  const odds = useOdds();
  if (!leg) return <div className={cn("h-12 rounded-lg border border-dashed border-line text-xs text-ink-3 grid place-items-center", className)}>-</div>;
  const selected = inSlip(leg.id);
  const ev = leg.ev;
  return (
    <button
      type="button"
      onClick={() => toggleLeg(leg)}
      title={`${leg.label}: ${odds(leg.fd.american)} at FanDuel, fair ${odds(probToAmerican(leg.modelProb))}. ${selected ? "Remove from" : "Add to"} slip.`}
      className={cn(
        "h-12 w-full rounded-lg border px-1 sm:px-2 text-center transition-colors",
        selected ? "border-accent bg-accent-bg" : "border-line-2 bg-surface-2 hover:bg-surface-3",
        className,
      )}
    >
      {showLine ? <span className="block text-[11px] text-ink-2 leading-4 tnum">{shortLine(leg)}</span> : null}
      <span className="flex items-center justify-center gap-1.5 leading-5">
        <span className="text-[13px] sm:text-sm font-semibold text-ink tnum">{odds(leg.fd.american)}</span>
        <span className={cn("text-[10px] sm:text-[11px] tnum", ev >= 0.005 ? "text-pos" : ev <= -0.03 ? "text-neg" : "text-ink-3")}>
          {ev > 0 ? "+" : ""}
          {(ev * 100).toFixed(1)}%
        </span>
      </span>
    </button>
  );
}

const SIGNAL_ICON: Record<Signal["category"], typeof Activity> = {
  market: Scale,
  price: BarChart3,
  model: Gauge,
  injury: Cross,
  form: TrendingUp,
  rest: Hourglass,
  weather: CloudRain,
  movement: LineChart,
  props: Users,
};

export function SignalList({ signals, limit }: { signals: Signal[]; limit?: number }) {
  const list = limit ? signals.slice(0, limit) : signals;
  return (
    <ul className="space-y-2">
      {list.map((s) => {
        const Icon = SIGNAL_ICON[s.category] ?? Activity;
        const tone = s.effect > 0.15 ? "text-pos" : s.effect < -0.15 ? "text-neg" : "text-ink-3";
        const word = s.effect > 0.15 ? "Supports" : s.effect < -0.15 ? "Against" : "Info";
        return (
          <li key={s.id} className="flex gap-2.5">
            <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", tone)} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {s.label} <span className={cn("text-[11px] font-medium", tone)}>({word})</span>
              </p>
              <p className="text-xs text-ink-2">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Signals that actually move the needle, strongest first. */
export function keySignals(leg: AnalyzedLeg, n = 2): Signal[] {
  return leg.signals
    .filter((s) => s.category !== "price" && (s.category === "market" || Math.abs(s.effect) > 0.15))
    .sort((a, b) => Math.abs(b.effect) * (b.weight || 6) - Math.abs(a.effect) * (a.weight || 6))
    .slice(0, n);
}

export function gameHref(leg: Pick<AnalyzedLeg, "sport" | "eventId">): string {
  return `/game/${leg.sport}/${encodeURIComponent(leg.eventId)}`;
}

/** Row used in lists of individual bets. */
export function LegRow({ leg, showGame = true }: { leg: AnalyzedLeg; showGame?: boolean }) {
  const inSlip = useInSlip();
  const odds = useOdds();
  const selected = inSlip(leg.id);
  const sigs = keySignals(leg, 2);
  return (
    <div className={cn("grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,0.8fr))_auto] sm:items-center", selected ? "border-accent bg-accent-bg/40" : "border-line bg-surface")}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{leg.label}</p>
        {showGame ? (
          <p className="text-xs text-ink-3 truncate">
            <span className="text-ink-2">{leg.sportLabel}</span> ·{" "}
            <Link href={gameHref(leg)} className="hover:text-ink hover:underline">
              {gameLabel(leg)}
            </Link>{" "}
            · {formatStart(leg.commenceTime)}
          </p>
        ) : null}
        {sigs.length ? (
          <p className="mt-1 text-xs text-ink-2 truncate" title={sigs.map((s) => `${s.label}: ${s.detail}`).join("\n")}>
            {sigs.map((s) => s.label).join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="text-right sm:text-left">
        <p className="text-xs text-ink-3">FanDuel</p>
        <p className="text-sm font-semibold tnum">{odds(leg.fd.american)}</p>
      </div>
      <div className="hidden sm:block">
        <p className="text-xs text-ink-3">Fair</p>
        <p className="text-sm tnum text-ink-2">
          {odds(probToAmerican(leg.modelProb))} <span className="text-ink-3">({formatPct(leg.modelProb, 0)})</span>
        </p>
      </div>
      <div className="flex sm:block items-center gap-3">
        <EvBadge ev={leg.ev} />
        <div className="sm:mt-1">
          <ConfidenceMeter value={leg.confidence} compact />
        </div>
      </div>
      <button
        type="button"
        onClick={() => toggleLeg(leg)}
        className={cn(
          "justify-self-end inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium",
          selected ? "bg-accent-strong text-white" : "bg-surface-2 border border-line-2 text-ink hover:bg-surface-3",
        )}
      >
        {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
        {selected ? "In slip" : "Add"}
      </button>
    </div>
  );
}
