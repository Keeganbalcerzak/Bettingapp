"use client";

import { ExternalLink, Layers } from "lucide-react";
import { useSettings } from "@/lib/client/settings";
import { setSlipLegs } from "@/lib/client/slip";
import { gameLabel, slipLink } from "@/lib/legs";
import { formatMoney, formatPct, formatSignedPct } from "@/lib/odds/convert";
import { recommendStake } from "@/lib/odds/ev";
import type { OptimizedParlay } from "@/lib/odds/optimizer";
import type { AnalyzedLeg } from "@/lib/types";
import { Button, Card, cn, ExternalButton, useDecimalOdds, useOdds } from "./ui";

export function ParlayCard({ parlay, legs, index, boostPct = 0 }: { parlay: OptimizedParlay; legs: Map<string, AnalyzedLeg>; index: number; boostPct?: number }) {
  const settings = useSettings();
  const odds = useOdds();
  const decOdds = useDecimalOdds();
  const full = parlay.legs.map((l) => legs.get(l.id)).filter((l): l is AnalyzedLeg => !!l);
  const p = parlay.pricing;
  const stake = recommendStake(p.prob, p.offeredDecimal, settings.bankroll, settings.kellyMultiplier, settings.maxBetPct, boostPct);
  const link = slipLink(full, settings.fanDuelHost);
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-ink-3">
          Parlay {index + 1} · {p.legCount} legs
        </p>
        <p className="text-lg font-semibold tnum">{decOdds(p.boostedDecimal)}</p>
      </div>
      <ul className="mt-2 space-y-1.5 flex-1">
        {full.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="block text-ink truncate">{l.label}</span>
              <span className="block text-xs text-ink-3 truncate">
                {l.sportLabel} · {gameLabel(l)}
              </span>
            </span>
            <span className="tnum text-ink-2 shrink-0">{odds(l.fd.american)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink-3">Hit chance</dt>
          <dd className="text-sm font-semibold tnum">{formatPct(p.prob)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">EV</dt>
          <dd className={cn("text-sm font-semibold tnum", p.ev > 0 ? "text-pos" : "text-neg")}>{formatSignedPct(p.ev)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Kelly stake</dt>
          <dd className="text-sm font-semibold tnum">{formatMoney(stake.stake)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setSlipLegs(full)}>
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Load into slip
        </Button>
        <ExternalButton href={link.url} disabled={!link.url} className="!px-2.5 !py-1 !text-xs" title={link.url ? "Open these legs in FanDuel" : "Needs live FanDuel ids"}>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          FanDuel
        </ExternalButton>
      </div>
    </Card>
  );
}
