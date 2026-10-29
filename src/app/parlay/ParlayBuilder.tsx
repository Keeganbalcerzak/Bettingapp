"use client";

import { Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ModeBanner } from "@/components/BoardStatus";
import { ParlaySummary } from "@/components/ParlaySummary";
import { ParlayCard } from "@/components/SuggestedParlays";
import { Button, Card, Empty, Field, inputClass, SectionTitle, Segmented, Spinner } from "@/components/ui";
import { useBoard } from "@/lib/client/board";
import { useSettings } from "@/lib/client/settings";
import { useSlip } from "@/lib/client/slip";
import { toOptimizerLeg } from "@/lib/legs";
import { americanToDecimal } from "@/lib/odds/convert";
import { OBJECTIVES, optimizeParlays, type Objective, type OptimizerResult } from "@/lib/odds/optimizer";
import { SPORTS } from "@/lib/sports";

type MarketSet = "all" | "sides" | "totals";

export function ParlayBuilder() {
  const { data: board, loading } = useBoard();
  const settings = useSettings();
  const slip = useSlip();
  const [minLegs, setMinLegs] = useState(2);
  const [maxLegs, setMaxLegs] = useState(4);
  const [objective, setObjective] = useState<Objective>("growth");
  const [boost, setBoost] = useState(0);
  const [minConf, setMinConf] = useState(45);
  const [markets, setMarkets] = useState<MarketSet>("all");
  const [sports, setSports] = useState<string[]>([]);
  const [minOdds, setMinOdds] = useState("");
  const [maxOdds, setMaxOdds] = useState("");
  const [maxLegOdds, setMaxLegOdds] = useState("+250");
  const [includeSlipProps, setIncludeSlipProps] = useState(true);
  const [result, setResult] = useState<OptimizerResult | null>(null);

  const pool = useMemo(() => {
    const base = board?.legs ?? [];
    // Props loaded on game pages can join the pool through the slip.
    const extra = includeSlipProps ? slip.legs.filter((l) => l.player && !base.some((b) => b.id === l.id)) : [];
    return [...base, ...extra];
  }, [board, slip.legs, includeSlipProps]);
  const byId = useMemo(() => new Map(pool.map((l) => [l.id, l])), [pool]);
  const loadedSports = board?.sports.filter((s) => s.games > 0).map((s) => s.key) ?? [];

  const run = () => {
    const legCap = maxLegOdds.trim() ? americanToDecimal(Number(maxLegOdds)) : Infinity;
    const candidates = pool
      .filter((l) => l.consensus.source === "consensus")
      .filter((l) => l.confidence >= minConf)
      .filter((l) => !sports.length || sports.includes(l.sport))
      .filter((l) => (markets === "sides" ? l.market === "h2h" || l.market === "spreads" : markets === "totals" ? l.market === "totals" : true))
      .filter((l) => !Number.isFinite(legCap) || l.fd.decimal <= legCap)
      .map(toOptimizerLeg);
    const min = minOdds.trim() ? Number(minOdds) : null;
    const max = maxOdds.trim() ? Number(maxOdds) : null;
    setResult(
      optimizeParlays(candidates, {
        minLegs,
        maxLegs,
        objective,
        boostPct: boost,
        kellyMultiplier: settings.kellyMultiplier,
        minParlayAmerican: Number.isFinite(min) ? min : null,
        maxParlayAmerican: Number.isFinite(max) ? max : null,
        // With a boost, slightly -EV legs can still be worth including.
        minLegEv: boost > 0 ? -0.04 : -0.005,
        maxResults: 8,
        diverse: true,
      }),
    );
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Parlay builder</h1>
        <p className="text-sm text-ink-2 mt-1 max-w-3xl">
          Build by hand from the board, or let the optimizer search thousands of combinations for the best risk-adjusted parlay. Every leg is
          priced with sharp no-vig odds blended with matchup info, and same game legs get a correlation adjustment.
        </p>
      </div>
      <ModeBanner board={board} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section>
          <SectionTitle title="Your slip" subtitle="Odds, fair odds, hit chance, EV and a Kelly stake for exactly these legs." />
          <Card className="p-4">
            <ParlaySummary />
          </Card>
        </section>
        <section>
          <SectionTitle title="Auto-build" subtitle="Searches legs from different games. Same game parlays are priced by FanDuel's own model, so build those by hand." />
          <Card className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Min legs">
                <input className={inputClass} type="number" min={2} max={8} value={minLegs} onChange={(e) => setMinLegs(Math.max(2, Math.min(8, Number(e.target.value) || 2)))} />
              </Field>
              <Field label="Max legs">
                <input className={inputClass} type="number" min={2} max={8} value={maxLegs} onChange={(e) => setMaxLegs(Math.max(2, Math.min(8, Number(e.target.value) || 2)))} />
              </Field>
              <Field label="Profit boost %" hint="Have a FanDuel parlay or profit boost? Enter it and the optimizer will find the legs that make the boost worth the most.">
                <input className={inputClass} inputMode="numeric" value={boost || ""} placeholder="0" onChange={(e) => setBoost(Math.max(0, Math.min(200, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)))} />
              </Field>
              <Field label="Min confidence" hint="Skip legs whose evidence is weak or contradictory. 45 drops the clear passes.">
                <input className={inputClass} type="number" min={0} max={99} value={minConf} onChange={(e) => setMinConf(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} />
              </Field>
              <Field label="Parlay odds from">
                <input className={inputClass} placeholder="+200" value={minOdds} onChange={(e) => setMinOdds(e.target.value.replace(/[^0-9+-]/g, ""))} />
              </Field>
              <Field label="Parlay odds to">
                <input className={inputClass} placeholder="+1000" value={maxOdds} onChange={(e) => setMaxOdds(e.target.value.replace(/[^0-9+-]/g, ""))} />
              </Field>
              <Field label="Longest leg" hint="Cap on any single leg's odds. Longshot legs carry the most vig.">
                <input className={inputClass} placeholder="+250" value={maxLegOdds} onChange={(e) => setMaxLegOdds(e.target.value.replace(/[^0-9+-]/g, ""))} />
              </Field>
              <Field label="Bet types">
                <select className={inputClass} value={markets} onChange={(e) => setMarkets(e.target.value as MarketSet)}>
                  <option value="all">All game lines</option>
                  <option value="sides">Sides only</option>
                  <option value="totals">Totals only</option>
                </select>
              </Field>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-2 mb-1.5">Optimize for</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {OBJECTIVES.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setObjective(o.id)}
                    className={`rounded-lg border p-2.5 text-left ${objective === o.id ? "border-accent bg-accent-bg" : "border-line-2 hover:bg-surface-2"}`}
                  >
                    <p className="text-sm font-medium">{o.label}</p>
                    <p className="text-xs text-ink-2">{o.blurb}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-ink-2">Sports</p>
              <Segmented<string>
                size="sm"
                value={sports.length ? "pick" : "all"}
                onChange={(v) => setSports(v === "all" ? [] : loadedSports.slice(0, 1))}
                options={[
                  { value: "all", label: "All loaded" },
                  { value: "pick", label: "Pick" },
                ]}
              />
              {sports.length
                ? SPORTS.filter((s) => loadedSports.includes(s.key)).map((s) => (
                    <label key={s.key} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                      <input
                        type="checkbox"
                        className="accent-[#2563eb]"
                        checked={sports.includes(s.key)}
                        onChange={(e) => setSports((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((x) => x !== s.key)))}
                      />
                      {s.short}
                    </label>
                  ))
                : null}
              <label className="inline-flex items-center gap-1.5 text-xs text-ink-2 ml-auto">
                <input type="checkbox" className="accent-[#2563eb]" checked={includeSlipProps} onChange={(e) => setIncludeSlipProps(e.target.checked)} />
                Include props from my slip
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={run} disabled={!board}>
                <Wand2 className="h-4 w-4" aria-hidden />
                Find best parlays
              </Button>
              {loading && !board ? <Spinner label="Loading the board..." /> : <span className="text-xs text-ink-3">{pool.length} legs available</span>}
            </div>
          </Card>

          <div className="mt-4">
            {result ? (
              result.parlays.length ? (
                <>
                  <p className="text-xs text-ink-3 mb-2">
                    Checked {result.evaluated.toLocaleString()} combinations of the top {result.candidates} legs
                    {result.truncated ? " (stopped early, narrow the filters for a full search)" : ""}.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {result.parlays.map((p, i) => (
                      <ParlayCard key={p.legs.map((l) => l.id).join("+")} parlay={p} legs={byId} index={i} boostPct={boost} />
                    ))}
                  </div>
                  {result.parlays.every((p) => p.pricing.ev <= 0) ? (
                    <p className="mt-3 text-sm text-warn">
                      None of these are +EV. That is the honest answer for the current board: parlaying -EV legs makes the house edge bigger, not smaller.
                    </p>
                  ) : null}
                </>
              ) : (
                <Empty title="No parlays fit those rules">Loosen the confidence, odds range or leg cap, or add sports.</Empty>
              )
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
