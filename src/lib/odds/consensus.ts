import { clampProb, invLogit, logit, normCdf, normInv } from "./stats";

export interface BookProb {
  book: string;
  prob: number;
  weight: number;
  sharp: boolean;
  lineAdjusted?: boolean;
}

export interface Consensus {
  prob: number;
  books: number;
  sharpBooks: number;
  totalWeight: number;
  lineAdjusted: boolean;
  spread: number; // max - min across books, a rough disagreement measure
}

/**
 * Weighted average of fair probabilities, done in logit space so that a 2% vs
 * 6% disagreement on a longshot counts as much as 48% vs 52% on a coin flip.
 */
export function consensusProb(inputs: BookProb[]): Consensus | null {
  const valid = inputs.filter((x) => Number.isFinite(x.prob) && x.prob > 0 && x.prob < 1 && x.weight > 0);
  if (!valid.length) return null;
  const totalWeight = valid.reduce((s, x) => s + x.weight, 0);
  const avgLogit = valid.reduce((s, x) => s + x.weight * logit(x.prob), 0) / totalWeight;
  const probs = valid.map((x) => x.prob);
  return {
    prob: invLogit(avgLogit),
    books: valid.length,
    sharpBooks: valid.filter((x) => x.sharp).length,
    totalWeight,
    lineAdjusted: valid.some((x) => x.lineAdjusted),
    spread: Math.max(...probs) - Math.min(...probs),
  };
}

/**
 * Moves a probability from one line to another, assuming the underlying
 * quantity (margin or total) is roughly normal with standard deviation sd.
 * `threshold` is the value the quantity must beat for the bet to win, so for an
 * Over 47.5 it is 47.5 and for a -3 spread it is +3.
 */
export function shiftProb(prob: number, fromThreshold: number, toThreshold: number, sd: number): number {
  if (fromThreshold === toThreshold || !(sd > 0)) return prob;
  return normCdf(normInv(clampProb(prob)) + (fromThreshold - toThreshold) / sd);
}

/**
 * Turns a side + point into the threshold the underlying variable must exceed.
 * Spreads use the side's own margin, totals use the total (negated for unders).
 */
export function winThreshold(kind: "spread" | "over" | "under", point: number): number {
  if (kind === "spread") return -point;
  if (kind === "over") return point;
  return -point;
}

/** Blend two probability estimates in logit space. weightB is the share for b. */
export function blendProbs(a: number, b: number | null | undefined, weightB: number): number {
  if (b === null || b === undefined || !Number.isFinite(b) || weightB <= 0) return a;
  const w = Math.min(1, weightB);
  return invLogit((1 - w) * logit(a) + w * logit(b));
}

/**
 * Blend, but never let the outside model move the market price by more than
 * maxShift. When a stats model disagrees with a liquid market by a mile, the
 * model is usually the one missing something.
 */
export function blendCapped(market: number, info: number | null | undefined, weight: number, maxShift: number): number {
  const blended = blendProbs(market, info, weight);
  return Math.min(market + maxShift, Math.max(market - maxShift, blended));
}
