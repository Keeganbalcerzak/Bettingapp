import { decimalToAmerican } from "./convert";
import { correlationMatrix, type CorrDescriptor } from "./correlation";
import { boostedDecimal, expectedValue, kellyFraction } from "./ev";
import { clampProb, gaussian, hashString, normInv, seededRng } from "./stats";

export interface ParlayLegInput {
  id: string;
  eventId: string;
  /** Market + side key used to catch conflicting legs, e.g. "evt|h2h". */
  marketKey: string;
  side: string;
  point?: number | null;
  decimal: number;
  /** Our probability for the leg (blended model). */
  prob: number;
  /** Market-only fair probability, for comparison. */
  fairProb?: number;
  corr: CorrDescriptor;
  label?: string;
}

export interface ParlayOptions {
  boostPct?: number;
  /** FanDuel's same game parlay price when the user types it in. */
  sgpDecimalOverride?: number | null;
  simulations?: number;
}

export interface ParlayPricing {
  legCount: number;
  games: number;
  isSameGame: boolean;
  /** Price FanDuel pays. For SGPs without an override this is the naive product. */
  offeredDecimal: number;
  offeredAmerican: number;
  boostedDecimal: number;
  boostedAmerican: number;
  priceIsEstimate: boolean;
  prob: number;
  fairProb: number;
  independentProb: number;
  correlationLift: number;
  fairDecimal: number;
  fairAmerican: number;
  ev: number;
  marketEv: number;
  kelly: number;
  conflicts: string[];
}

/** Finds legs FanDuel would reject or that can never win together. */
export function findConflicts(legs: ParlayLegInput[]): string[] {
  const issues: string[] = [];
  const seen = new Map<string, ParlayLegInput>();
  for (const leg of legs) {
    if (seen.has(leg.id)) {
      issues.push(`${leg.label ?? leg.id} is in the slip twice.`);
      continue;
    }
    seen.set(leg.id, leg);
  }
  const byMarket = new Map<string, ParlayLegInput[]>();
  for (const leg of seen.values()) {
    const list = byMarket.get(leg.marketKey) ?? [];
    list.push(leg);
    byMarket.set(leg.marketKey, list);
  }
  for (const list of byMarket.values()) {
    if (list.length > 1) {
      const names = list.map((l) => l.label ?? l.id).join(" + ");
      issues.push(`${names} come from the same market. FanDuel only allows one pick per market.`);
    }
  }
  return issues;
}

/** Probability that every leg in one game hits, via a Gaussian copula simulation. */
export function jointProbability(legs: { prob: number; corr: CorrDescriptor }[], simulations = 60000): number {
  if (legs.length === 0) return 1;
  if (legs.length === 1) return legs[0].prob;
  const { chol } = correlationMatrix(legs.map((l) => l.corr));
  const thresholds = legs.map((l) => normInv(clampProb(l.prob)));
  const n = legs.length;
  const seed = hashString(legs.map((l) => `${l.corr.kind}:${l.corr.stat ?? ""}:${l.prob.toFixed(4)}`).join("|"));
  const rng = seededRng(seed);
  const z = new Array<number>(n);
  let hits = 0;
  const pairs = Math.ceil(simulations / 2);
  for (let s = 0; s < pairs; s++) {
    for (let i = 0; i < n; i++) z[i] = gaussian(rng);
    // Antithetic pair: evaluate z and -z to cut simulation noise.
    for (const sign of [1, -1]) {
      let all = true;
      for (let i = 0; i < n && all; i++) {
        let v = 0;
        for (let k = 0; k <= i; k++) v += chol[i][k] * z[k] * sign;
        if (v > thresholds[i]) all = false;
      }
      if (all) hits++;
    }
  }
  return hits / (pairs * 2);
}

export function priceParlay(legs: ParlayLegInput[], options: ParlayOptions = {}): ParlayPricing {
  const boostPct = options.boostPct ?? 0;
  const conflicts = findConflicts(legs);
  const byGame = new Map<string, ParlayLegInput[]>();
  for (const leg of legs) {
    const list = byGame.get(leg.eventId) ?? [];
    list.push(leg);
    byGame.set(leg.eventId, list);
  }
  const isSameGame = [...byGame.values()].some((g) => g.length > 1);

  let prob = 1;
  let fairProb = 1;
  let independentProb = 1;
  for (const group of byGame.values()) {
    prob *= jointProbability(group.map((l) => ({ prob: l.prob, corr: l.corr })), options.simulations);
    fairProb *= jointProbability(
      group.map((l) => ({ prob: l.fairProb ?? l.prob, corr: l.corr })),
      options.simulations,
    );
    for (const l of group) independentProb *= l.prob;
  }

  const productDecimal = legs.reduce((acc, l) => acc * l.decimal, 1);
  const override = options.sgpDecimalOverride;
  const hasOverride = typeof override === "number" && override > 1;
  const offeredDecimal = hasOverride ? override : productDecimal;
  const finalDecimal = boostedDecimal(offeredDecimal, boostPct);

  return {
    legCount: legs.length,
    games: byGame.size,
    isSameGame,
    offeredDecimal,
    offeredAmerican: decimalToAmerican(offeredDecimal),
    boostedDecimal: finalDecimal,
    boostedAmerican: decimalToAmerican(finalDecimal),
    priceIsEstimate: isSameGame && !hasOverride,
    prob,
    fairProb,
    independentProb,
    correlationLift: independentProb > 0 ? prob / independentProb : 1,
    fairDecimal: prob > 0 ? 1 / prob : Infinity,
    fairAmerican: prob > 0 ? decimalToAmerican(1 / prob) : NaN,
    ev: expectedValue(prob, offeredDecimal, boostPct),
    marketEv: expectedValue(fairProb, offeredDecimal, boostPct),
    kelly: kellyFraction(prob, offeredDecimal, boostPct),
    conflicts,
  };
}
