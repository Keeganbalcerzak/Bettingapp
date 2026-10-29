// Expected value and stake sizing.

/** Decimal odds after a FanDuel style profit boost (boost applies to profit only). */
export function boostedDecimal(decimal: number, boostPct = 0): number {
  return 1 + (decimal - 1) * (1 + Math.max(0, boostPct) / 100);
}

/** Expected profit per $1 staked. 0.05 means +5% EV. */
export function expectedValue(prob: number, decimal: number, boostPct = 0): number {
  return prob * boostedDecimal(decimal, boostPct) - 1;
}

/** Full Kelly fraction of bankroll. Zero when the bet has no edge. */
export function kellyFraction(prob: number, decimal: number, boostPct = 0): number {
  const d = boostedDecimal(decimal, boostPct);
  const b = d - 1;
  if (!(b > 0)) return 0;
  return Math.max(0, (prob * d - 1) / b);
}

/** Expected log growth of bankroll when staking fraction f. */
export function kellyGrowth(prob: number, decimal: number, f: number, boostPct = 0): number {
  const b = boostedDecimal(decimal, boostPct) - 1;
  if (f <= 0) return 0;
  if (f >= 1) return -Infinity;
  return prob * Math.log(1 + f * b) + (1 - prob) * Math.log(1 - f);
}

/** Probability you need just to break even at these odds. */
export function breakEvenProb(decimal: number, boostPct = 0): number {
  return 1 / boostedDecimal(decimal, boostPct);
}

export interface StakeAdvice {
  fullKelly: number;
  fraction: number;
  stake: number;
  capped: boolean;
}

/**
 * Fractional Kelly stake. Quarter Kelly is the default because our probabilities
 * are estimates, and over-betting an overestimated edge is how bankrolls die.
 */
export function recommendStake(
  prob: number,
  decimal: number,
  bankroll: number,
  kellyMultiplier = 0.25,
  maxPctOfBankroll = 0.05,
  boostPct = 0,
): StakeAdvice {
  const fullKelly = kellyFraction(prob, decimal, boostPct);
  let fraction = fullKelly * kellyMultiplier;
  const capped = fraction > maxPctOfBankroll;
  if (capped) fraction = maxPctOfBankroll;
  const stake = Math.max(0, Math.floor(bankroll * fraction * 100) / 100);
  return { fullKelly, fraction, stake, capped };
}
