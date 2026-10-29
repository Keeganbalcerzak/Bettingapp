// Removing the vig ("devigging") turns a book's prices into fair probabilities.
// Every method takes the implied probabilities (1 / decimal) of all outcomes in a
// market and returns probabilities that sum to 1.

export type DevigMethod = "multiplicative" | "additive" | "power" | "shin";

export const DEVIG_METHODS: { id: DevigMethod; label: string; blurb: string }[] = [
  {
    id: "power",
    label: "Power",
    blurb: "Raises each probability to a common power. Takes more vig off longshots, which matches how books actually shade prices.",
  },
  {
    id: "shin",
    label: "Shin",
    blurb: "Models the book protecting itself from insiders. Similar to power, popular in academic work.",
  },
  {
    id: "multiplicative",
    label: "Multiplicative",
    blurb: "Scales every probability down by the same factor. Simple, slightly overrates longshots.",
  },
  {
    id: "additive",
    label: "Additive",
    blurb: "Subtracts the same amount from every outcome. Can badly overrate favorites.",
  },
];

export function overround(implied: number[]): number {
  return implied.reduce((s, q) => s + q, 0) - 1;
}

/** Book hold: share of total handle the book keeps on a balanced market. */
export function hold(implied: number[]): number {
  const total = implied.reduce((s, q) => s + q, 0);
  return total > 0 ? 1 - 1 / total : NaN;
}

function multiplicative(q: number[]): number[] {
  const total = q.reduce((s, x) => s + x, 0);
  return q.map((x) => x / total);
}

function additive(q: number[]): number[] {
  const excess = (q.reduce((s, x) => s + x, 0) - 1) / q.length;
  const raw = q.map((x) => Math.max(1e-6, x - excess));
  return multiplicative(raw);
}

function bisect(f: (x: number) => number, lo: number, hi: number, iterations = 80): number {
  let fLo = f(lo);
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

function power(q: number[]): number[] {
  // Solve sum(q_i ^ k) = 1. The left side falls as k grows because every q_i < 1.
  if (q.some((x) => x >= 1)) return multiplicative(q);
  const f = (k: number) => q.reduce((s, x) => s + Math.pow(x, k), 0) - 1;
  let hi = 2;
  while (f(hi) > 0 && hi < 64) hi *= 2;
  const k = bisect(f, 1e-6, hi);
  return multiplicative(q.map((x) => Math.pow(x, k)));
}

function shin(q: number[]): number[] {
  const total = q.reduce((s, x) => s + x, 0);
  if (total <= 1) return multiplicative(q);
  const probsFor = (z: number) =>
    q.map((x) => (Math.sqrt(z * z + (4 * (1 - z) * x * x) / total) - z) / (2 * (1 - z)));
  const g = (z: number) => probsFor(z).reduce((s, p) => s + p, 0) - 1;
  if (!(g(0) > 0 && g(0.99) < 0)) return multiplicative(q);
  const z = bisect(g, 0, 0.99);
  return multiplicative(probsFor(z));
}

export function devig(implied: number[], method: DevigMethod = "power"): number[] {
  const clean = implied.map((x) => (Number.isFinite(x) && x > 0 ? x : NaN));
  if (clean.length < 2 || clean.some((x) => Number.isNaN(x))) return clean.map(() => NaN);
  switch (method) {
    case "multiplicative":
      return multiplicative(clean);
    case "additive":
      return additive(clean);
    case "shin":
      return shin(clean);
    case "power":
    default:
      return power(clean);
  }
}

/**
 * Fair probability for a one-sided market (e.g. anytime TD "Yes" with no "No"
 * price). There is nothing to devig against, so we strip an assumed margin.
 */
export function devigOneSided(implied: number, assumedHold = 0.07): number {
  if (!(implied > 0)) return NaN;
  return Math.min(0.999, implied * (1 - assumedHold));
}
