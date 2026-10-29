import { decimalToAmerican } from "./convert";
import { boostedDecimal, expectedValue, kellyFraction } from "./ev";
import { priceParlay, type ParlayLegInput, type ParlayPricing } from "./parlay";

export type Objective = "growth" | "ev" | "hit" | "sharpe";

export const OBJECTIVES: { id: Objective; label: string; blurb: string }[] = [
  {
    id: "growth",
    label: "Bankroll growth (Kelly)",
    blurb: "Best long-run growth. Balances edge against how often the parlay actually hits. Recommended.",
  },
  {
    id: "sharpe",
    label: "Edge per unit of risk",
    blurb: "Highest EV relative to the swings. Tends to pick 2 and 3 leg parlays.",
  },
  {
    id: "hit",
    label: "Most likely to hit (+EV only)",
    blurb: "Highest win probability among parlays that still have positive EV.",
  },
  {
    id: "ev",
    label: "Max EV",
    blurb: "Largest expected profit per dollar. Favors long parlays that rarely hit.",
  },
];

export interface OptimizerLeg extends ParlayLegInput {
  /** Single leg EV at FanDuel's price, used to rank candidates. */
  ev: number;
}

export interface OptimizerOptions {
  minLegs: number;
  maxLegs: number;
  objective: Objective;
  boostPct?: number;
  maxResults?: number;
  candidateLimit?: number;
  /** Skip legs worse than this EV. Slightly negative lets near-fair legs fill parlays. */
  minLegEv?: number;
  minParlayAmerican?: number | null;
  maxParlayAmerican?: number | null;
  /** Minimum parlay EV for the "hit" objective. */
  minParlayEv?: number;
  kellyMultiplier?: number;
  maxEvaluations?: number;
  /** Skip results that share half or more of their legs with a better result. */
  diverse?: boolean;
}

export interface OptimizedParlay {
  legs: OptimizerLeg[];
  pricing: ParlayPricing;
  score: number;
}

export interface OptimizerResult {
  parlays: OptimizedParlay[];
  candidates: number;
  evaluated: number;
  truncated: boolean;
}

function scoreCombo(prob: number, decimal: number, opts: Required<Pick<OptimizerOptions, "objective" | "boostPct" | "kellyMultiplier" | "minParlayEv">>): number {
  const ev = expectedValue(prob, decimal, opts.boostPct);
  const d = boostedDecimal(decimal, opts.boostPct);
  switch (opts.objective) {
    case "ev":
      return ev;
    case "hit":
      return ev >= opts.minParlayEv ? 1 + prob : -1 + ev;
    case "sharpe": {
      const sd = d * Math.sqrt(prob * (1 - prob));
      return sd > 0 ? ev / sd : ev;
    }
    case "growth":
    default: {
      const f = Math.min(0.2, kellyFraction(prob, decimal, opts.boostPct) * opts.kellyMultiplier);
      if (f <= 0) return ev * 1e-4;
      return prob * Math.log(1 + f * (d - 1)) + (1 - prob) * Math.log(1 - f);
    }
  }
}

/**
 * Searches combinations of legs from different games for the best parlays.
 * Legs from the same game are excluded because FanDuel prices same game
 * parlays with its own correlation model, so the product of leg prices would
 * be wrong.
 */
export function optimizeParlays(legs: OptimizerLeg[], options: OptimizerOptions): OptimizerResult {
  const opts = {
    boostPct: 0,
    maxResults: 8,
    candidateLimit: 22,
    minLegEv: -0.015,
    minParlayAmerican: null as number | null,
    maxParlayAmerican: null as number | null,
    minParlayEv: 0,
    kellyMultiplier: 0.25,
    maxEvaluations: 400000,
    diverse: false,
    ...options,
  };
  const minLegs = Math.max(2, Math.min(opts.minLegs, opts.maxLegs));
  const maxLegs = Math.max(minLegs, opts.maxLegs);

  // A boost changes which legs are worth including, so rank with the boost applied.
  const unique = new Map<string, OptimizerLeg>();
  for (const leg of legs) {
    if (!Number.isFinite(leg.prob) || !Number.isFinite(leg.decimal) || leg.decimal <= 1) continue;
    if (leg.ev < opts.minLegEv) continue;
    const existing = unique.get(leg.id);
    if (!existing || existing.ev < leg.ev) unique.set(leg.id, leg);
  }
  // Keep only the best leg per game so the search space is legs from distinct games.
  const bestPerGame = new Map<string, OptimizerLeg[]>();
  for (const leg of unique.values()) {
    const list = bestPerGame.get(leg.eventId) ?? [];
    list.push(leg);
    bestPerGame.set(leg.eventId, list);
  }
  const pool: OptimizerLeg[] = [];
  for (const list of bestPerGame.values()) {
    list.sort((a, b) => b.ev - a.ev);
    pool.push(...list.slice(0, 3));
  }
  pool.sort((a, b) => b.ev - a.ev);
  const cands = pool.slice(0, opts.candidateLimit);

  type Combo = { idx: number[]; prob: number; decimal: number; score: number };
  const top: Combo[] = [];
  const keep = opts.maxResults * 6;
  let evaluated = 0;
  let truncated = false;

  const inRange = (decimal: number) => {
    const american = decimalToAmerican(boostedDecimal(decimal, opts.boostPct));
    if (opts.minParlayAmerican !== null && american < opts.minParlayAmerican) return false;
    if (opts.maxParlayAmerican !== null && american > opts.maxParlayAmerican) return false;
    return true;
  };

  const chosen: number[] = [];
  const usedEvents = new Set<string>();
  const dfs = (start: number, prob: number, decimal: number) => {
    if (truncated) return;
    if (chosen.length >= minLegs && inRange(decimal)) {
      evaluated++;
      const score = scoreCombo(prob, decimal, opts);
      top.push({ idx: [...chosen], prob, decimal, score });
      if (top.length > keep * 2) {
        top.sort((a, b) => b.score - a.score);
        top.length = keep;
      }
      if (evaluated >= opts.maxEvaluations) {
        truncated = true;
        return;
      }
    }
    if (chosen.length === maxLegs) return;
    for (let i = start; i < cands.length; i++) {
      const leg = cands[i];
      if (usedEvents.has(leg.eventId)) continue;
      chosen.push(i);
      usedEvents.add(leg.eventId);
      dfs(i + 1, prob * leg.prob, decimal * leg.decimal);
      usedEvents.delete(leg.eventId);
      chosen.pop();
      if (truncated) return;
    }
  };
  dfs(0, 1, 1);

  top.sort((a, b) => b.score - a.score);
  let chosenCombos = top;
  if (opts.diverse) {
    chosenCombos = [];
    for (const combo of top) {
      const overlaps = chosenCombos.some((c) => {
        const shared = combo.idx.filter((i) => c.idx.includes(i)).length;
        return shared / Math.min(combo.idx.length, c.idx.length) >= 0.5;
      });
      if (!overlaps) chosenCombos.push(combo);
      if (chosenCombos.length >= opts.maxResults) break;
    }
  }
  const parlays = chosenCombos.slice(0, opts.maxResults).map((combo) => {
    const picked = combo.idx.map((i) => cands[i]);
    return {
      legs: picked,
      pricing: priceParlay(picked, { boostPct: opts.boostPct }),
      score: combo.score,
    };
  });
  return { parlays, candidates: cands.length, evaluated, truncated };
}
