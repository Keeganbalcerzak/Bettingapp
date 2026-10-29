"use client";

import { AlertTriangle, ExternalLink, Link2, NotebookPen, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { addBet, trackedLeg } from "@/lib/client/bets";
import { useSettings } from "@/lib/client/settings";
import { clearSlip, removeLeg, updateSlip, useSlip } from "@/lib/client/slip";
import { gameLabel, slipLink, toParlayLeg } from "@/lib/legs";
import { americanToDecimal, formatMoney, formatPct, formatSignedPct } from "@/lib/odds/convert";
import { recommendStake } from "@/lib/odds/ev";
import { priceParlay } from "@/lib/odds/parlay";
import { Badge, Button, cn, EvBadge, ExternalButton, Field, Hint, inputClass, useDecimalOdds, useOdds } from "./ui";

export function useSlipPricing() {
  const slip = useSlip();
  const settings = useSettings();
  const sgpDecimal = slip.sgpAmerican.trim() ? americanToDecimal(Number(slip.sgpAmerican)) : null;
  const pricing = useMemo(() => {
    if (!slip.legs.length) return null;
    return priceParlay(slip.legs.map(toParlayLeg), {
      boostPct: slip.boostPct,
      sgpDecimalOverride: sgpDecimal !== null && Number.isFinite(sgpDecimal) ? sgpDecimal : null,
    });
  }, [slip.legs, slip.boostPct, sgpDecimal]);
  const advice = pricing
    ? recommendStake(pricing.prob, pricing.offeredDecimal, settings.bankroll, settings.kellyMultiplier, settings.maxBetPct, slip.boostPct)
    : null;
  const link = slipLink(slip.legs, settings.fanDuelHost);
  return { slip, settings, pricing, advice, link };
}

export function ParlaySummary({ compact = false, onLogged }: { compact?: boolean; onLogged?: () => void }) {
  const { slip, pricing, advice, link } = useSlipPricing();
  const odds = useOdds();
  const decOdds = useDecimalOdds();
  const [logged, setLogged] = useState(false);

  if (!slip.legs.length || !pricing) {
    return <p className="text-sm text-ink-2">Your slip is empty. Tap any price on the board to add a leg.</p>;
  }
  const stake = Number(slip.stake) > 0 ? Number(slip.stake) : (advice?.stake ?? 0);
  const demo = slip.legs.some((l) => l.demo);
  const toWin = stake * (pricing.boostedDecimal - 1);
  const expected = stake * pricing.ev;

  const logBet = () => {
    addBet({
      legs: slip.legs.map(trackedLeg),
      stake,
      decimal: pricing.offeredDecimal,
      boostPct: slip.boostPct,
      prob: pricing.prob,
      fairProb: pricing.fairProb,
      ev: pricing.ev,
      sameGame: pricing.isSameGame,
      notes: pricing.priceIsEstimate ? "SGP logged at the naive product price; edit if FanDuel paid differently." : "",
      demo,
    });
    setLogged(true);
    onLogged?.();
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {slip.legs.map((l) => (
          <li key={l.id} className="flex items-start gap-3 rounded-lg border border-line bg-bg/60 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink truncate">{l.label}</p>
              <p className="text-xs text-ink-3 truncate">
                {l.sportLabel} · {gameLabel(l)} · {l.marketLabel}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold tnum">{odds(l.fd.american)}</p>
              <EvBadge ev={l.ev} />
            </div>
            <button type="button" aria-label={`Remove ${l.label}`} onClick={() => removeLeg(l.id)} className="text-ink-3 hover:text-ink mt-0.5">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {pricing.conflicts.length ? (
        <div className="rounded-lg border border-[#5a2326] bg-neg-bg p-3 text-sm text-neg space-y-1">
          {pricing.conflicts.map((c) => (
            <p key={c} className="flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              {c}
            </p>
          ))}
        </div>
      ) : null}

      {pricing.isSameGame ? (
        <div className="rounded-lg border border-[#5a4517] bg-warn-bg p-3 text-sm text-ink-2 space-y-2">
          <p className="flex gap-2 text-warn font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            Same game legs. FanDuel prices this as a Same Game Parlay.
          </p>
          <p>
            Correlation moves the true odds {pricing.correlationLift >= 1 ? "up" : "down"} by about{" "}
            <span className="text-ink tnum">{formatPct(Math.abs(pricing.correlationLift - 1), 0)}</span> versus treating the legs as independent.
            FanDuel adjusts its SGP price for this too, so type in the price FanDuel shows to check the real edge.
          </p>
          <Field label="FanDuel SGP odds (American)">
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="e.g. +450"
              value={slip.sgpAmerican}
              onChange={(e) => updateSlip({ sgpAmerican: e.target.value.replace(/[^0-9+-]/g, "") })}
            />
          </Field>
        </div>
      ) : null}

      <dl className={cn("grid gap-x-4 gap-y-2 text-sm", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        <div>
          <dt className="text-xs text-ink-3">FanDuel odds{slip.boostPct ? " (boosted)" : ""}</dt>
          <dd className="font-semibold tnum">
            {decOdds(pricing.boostedDecimal)}
            {pricing.priceIsEstimate ? <span className="ml-1 text-xs font-normal text-warn">est.</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3 flex items-center gap-1">
            Fair odds
            <Hint>The price this parlay would pay with zero house edge, from our blended probability of every leg hitting.</Hint>
          </dt>
          <dd className="font-semibold tnum">{Number.isFinite(pricing.fairDecimal) ? decOdds(pricing.fairDecimal) : "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Hit chance</dt>
          <dd className="font-semibold tnum">{formatPct(pricing.prob)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3 flex items-center gap-1">
            Expected value
            <Hint>Average profit per $1 if you made this exact bet many times. Market-only EV: {formatSignedPct(pricing.marketEv)}.</Hint>
          </dt>
          <dd className={cn("font-semibold tnum", pricing.ev > 0 ? "text-pos" : "text-neg")}>{formatSignedPct(pricing.ev)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3 flex items-center gap-1">
            Kelly stake
            <Hint>
              Fractional Kelly from your settings ({formatPct(advice?.fraction ?? 0)} of bankroll here). Zero means the edge is not there, so
              the math says skip it.
            </Hint>
          </dt>
          <dd className="font-semibold tnum">{advice ? formatMoney(advice.stake) : "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Legs / games</dt>
          <dd className="font-semibold tnum">
            {pricing.legCount} / {pricing.games}
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Profit boost %" hint="FanDuel profit boosts multiply the profit part of the payout. A 30% boost on +300 pays +390.">
          <input
            className={inputClass}
            inputMode="numeric"
            value={slip.boostPct ? String(slip.boostPct) : ""}
            placeholder="0"
            onChange={(e) => updateSlip({ boostPct: Math.min(200, Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)) })}
          />
        </Field>
        <Field label="Stake $">
          <input
            className={inputClass}
            inputMode="decimal"
            value={slip.stake}
            placeholder={advice ? advice.stake.toFixed(2) : "0"}
            onChange={(e) => updateSlip({ stake: e.target.value.replace(/[^0-9.]/g, "") })}
          />
        </Field>
      </div>
      <p className="text-xs text-ink-2 tnum">
        {formatMoney(stake)} to win {formatMoney(toWin)}. Expected profit {formatMoney(expected)}.
      </p>

      <div className="flex flex-wrap gap-2">
        <ExternalButton
          href={link.url}
          disabled={!link.url}
          title={link.url ? "Opens FanDuel with these picks in your betslip" : demo ? "Demo prices have no FanDuel ids. Add an Odds API key for live links." : "FanDuel did not return betslip ids for these picks"}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Open in FanDuel
        </ExternalButton>
        <Button onClick={logBet} disabled={!stake}>
          <NotebookPen className="h-4 w-4" aria-hidden />
          {logged ? "Logged" : "Log bet"}
        </Button>
        <Button variant="ghost" onClick={clearSlip}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Clear
        </Button>
      </div>
      {link.url && link.missing ? (
        <p className="text-xs text-warn flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          {link.missing} leg{link.missing > 1 ? "s" : ""} had no FanDuel id and will need to be added by hand.
        </p>
      ) : null}
      {demo ? (
        <p className="text-xs text-ink-3">
          <Badge tone="warn">Demo</Badge> Prices are simulated around real lines. Add an Odds API key to get real FanDuel prices and betslip links.
        </p>
      ) : null}
    </div>
  );
}
