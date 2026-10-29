import { describe, expect, it } from "vitest";
import { americanToDecimal, americanToProb, decimalToAmerican, formatAmerican, probToAmerican } from "./convert";
import { blendProbs, consensusProb, shiftProb, winThreshold } from "./consensus";
import { correlationMatrix, legCorrelation, type CorrDescriptor } from "./correlation";
import { devig, devigOneSided, hold } from "./devig";
import { boostedDecimal, expectedValue, kellyFraction, recommendStake } from "./ev";
import { optimizeParlays, type OptimizerLeg } from "./optimizer";
import { findConflicts, jointProbability, priceParlay, type ParlayLegInput } from "./parlay";
import { normCdf, normInv, poissonCdf } from "./stats";

const close = (a: number, b: number, eps = 1e-3) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("conversions", () => {
  it("converts american and decimal both ways", () => {
    expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 4);
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 6);
    expect(americanToDecimal(100)).toBe(2);
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.5)).toBe(-200);
    expect(decimalToAmerican(2)).toBe(100);
    expect(formatAmerican(150)).toBe("+150");
    expect(formatAmerican(-110)).toBe("-110");
  });

  it("round trips probabilities", () => {
    expect(americanToProb(-200)).toBeCloseTo(2 / 3, 6);
    expect(probToAmerican(0.5)).toBe(100);
    expect(probToAmerican(0.25)).toBe(300);
  });
});

describe("stats", () => {
  it("normal cdf and inverse agree", () => {
    close(normCdf(0), 0.5, 1e-7);
    close(normCdf(1.96), 0.975, 1e-4);
    for (const p of [0.01, 0.2, 0.5, 0.8, 0.99]) close(normCdf(normInv(p)), p, 1e-6);
  });

  it("poisson cdf", () => {
    close(poissonCdf(0, 1), Math.exp(-1), 1e-9);
    close(poissonCdf(2, 2), 0.6767, 1e-4);
  });
});

describe("devig", () => {
  const q = (...american: number[]) => american.map(americanToProb);

  it("splits a -110/-110 market evenly with every method", () => {
    for (const m of ["multiplicative", "additive", "power", "shin"] as const) {
      const [a, b] = devig(q(-110, -110), m);
      close(a, 0.5, 1e-9);
      close(b, 0.5, 1e-9);
    }
  });

  it("returns probabilities that sum to one", () => {
    for (const m of ["multiplicative", "additive", "power", "shin"] as const) {
      const probs = devig(q(-250, 200), m);
      close(probs.reduce((s, p) => s + p, 0), 1, 1e-9);
      const three = devig(q(150, 230, 210), m);
      close(three.reduce((s, p) => s + p, 0), 1, 1e-9);
    }
  });

  it("power and shin give the longshot less than multiplicative does", () => {
    const mult = devig(q(-400, 300), "multiplicative")[1];
    const pow = devig(q(-400, 300), "power")[1];
    const shinP = devig(q(-400, 300), "shin")[1];
    expect(pow).toBeLessThan(mult);
    expect(shinP).toBeLessThan(mult);
  });

  it("measures hold", () => {
    close(hold(q(-110, -110)), 0.04545, 1e-4);
  });

  it("handles one sided markets", () => {
    close(devigOneSided(0.5, 0.1), 0.45, 1e-9);
  });
});

describe("consensus", () => {
  it("weights sharp books more", () => {
    const c = consensusProb([
      { book: "pinnacle", prob: 0.6, weight: 3, sharp: true },
      { book: "soft", prob: 0.5, weight: 1, sharp: false },
    ]);
    expect(c).not.toBeNull();
    expect(c!.prob).toBeGreaterThan(0.55);
    expect(c!.prob).toBeLessThan(0.6);
    expect(c!.sharpBooks).toBe(1);
    expect(c!.books).toBe(2);
  });

  it("returns null with no usable books", () => {
    expect(consensusProb([])).toBeNull();
    expect(consensusProb([{ book: "x", prob: NaN, weight: 1, sharp: false }])).toBeNull();
  });

  it("shifts probabilities across lines", () => {
    // -3 to -3.5: harder to cover.
    const p = shiftProb(0.5, winThreshold("spread", -3), winThreshold("spread", -3.5), 13.5);
    expect(p).toBeLessThan(0.5);
    close(p, normCdf(-0.5 / 13.5), 1e-6);
    // Over 47.5 to Over 46.5: easier.
    expect(shiftProb(0.5, winThreshold("over", 47.5), winThreshold("over", 46.5), 10)).toBeGreaterThan(0.5);
    // Under 47.5 to Under 46.5: harder.
    expect(shiftProb(0.5, winThreshold("under", 47.5), winThreshold("under", 46.5), 10)).toBeLessThan(0.5);
  });

  it("blends in logit space", () => {
    expect(blendProbs(0.5, null, 0.5)).toBe(0.5);
    close(blendProbs(0.5, 0.5, 0.3), 0.5, 1e-12);
    const b = blendProbs(0.5, 0.7, 0.25);
    expect(b).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.7);
  });
});

describe("ev and kelly", () => {
  it("computes ev with and without boosts", () => {
    close(expectedValue(0.55, 2), 0.1, 1e-12);
    close(boostedDecimal(3, 50), 4, 1e-12);
    close(expectedValue(0.25, 3, 50), 0, 1e-12);
  });

  it("computes kelly", () => {
    close(kellyFraction(0.55, 2), 0.1, 1e-12);
    expect(kellyFraction(0.4, 2)).toBe(0);
    const advice = recommendStake(0.55, 2, 1000, 0.25, 0.05);
    close(advice.stake, 25, 1e-9);
    expect(recommendStake(0.9, 2, 1000, 1, 0.05).capped).toBe(true);
  });
});

const desc = (over: Partial<CorrDescriptor>): CorrDescriptor => ({
  sport: "americanfootball_nfl",
  eventId: "g1",
  kind: "ml",
  teamSide: "home",
  direction: 1,
  homeFavored: true,
  ...over,
});

describe("correlation", () => {
  it("treats moneyline and spread on the same team as nearly identical", () => {
    expect(legCorrelation(desc({ kind: "ml" }), desc({ kind: "spread" }))).toBeGreaterThan(0.99);
    expect(legCorrelation(desc({ kind: "ml" }), desc({ kind: "spread", teamSide: "away" }))).toBeLessThan(-0.99);
  });

  it("legs in different games are independent", () => {
    expect(legCorrelation(desc({}), desc({ eventId: "g2" }))).toBe(0);
  });

  it("passing and receiving for teammates correlate", () => {
    const qb = desc({ kind: "prop", stat: "pass_yds", player: "QB", teamSide: "home" });
    const wr = desc({ kind: "prop", stat: "rec_yds", player: "WR", teamSide: "home" });
    expect(legCorrelation(qb, wr)).toBeCloseTo(0.45, 6);
    expect(legCorrelation(qb, { ...wr, direction: -1 })).toBeCloseTo(-0.45, 6);
  });

  it("always produces a usable matrix", () => {
    const legs = [
      desc({ kind: "ml" }),
      desc({ kind: "spread" }),
      desc({ kind: "spread", teamSide: "away" }),
      desc({ kind: "total", direction: 1, teamSide: null }),
    ];
    const { chol } = correlationMatrix(legs);
    expect(chol.length).toBe(4);
  });
});

describe("parlay pricing", () => {
  const leg = (id: string, eventId: string, american: number, prob: number, corr?: Partial<CorrDescriptor>): ParlayLegInput => ({
    id,
    eventId,
    marketKey: `${eventId}|${id}`,
    side: "home",
    decimal: americanToDecimal(american),
    prob,
    corr: desc({ eventId, ...corr }),
    label: id,
  });

  it("multiplies independent legs", () => {
    const p = priceParlay([leg("a", "g1", -110, 0.55), leg("b", "g2", -110, 0.55)]);
    close(p.prob, 0.3025, 1e-9);
    close(p.offeredDecimal, americanToDecimal(-110) ** 2, 1e-9);
    expect(p.isSameGame).toBe(false);
    expect(p.priceIsEstimate).toBe(false);
    close(p.ev, 0.3025 * americanToDecimal(-110) ** 2 - 1, 1e-9);
  });

  it("applies profit boosts", () => {
    const base = priceParlay([leg("a", "g1", 100, 0.5), leg("b", "g2", 100, 0.5)]);
    const boosted = priceParlay([leg("a", "g1", 100, 0.5), leg("b", "g2", 100, 0.5)], { boostPct: 50 });
    close(base.ev, 0, 1e-9);
    close(boosted.boostedDecimal, 5.5, 1e-9);
    close(boosted.ev, 0.375, 1e-9);
  });

  it("raises the joint probability for correlated same game legs", () => {
    const ml = leg("ml", "g1", -150, 0.6, { kind: "ml" });
    const spread = leg("sp", "g1", 110, 0.48, { kind: "spread" });
    const p = priceParlay([ml, spread]);
    expect(p.isSameGame).toBe(true);
    expect(p.priceIsEstimate).toBe(true);
    // Covering the spread basically implies winning, so the joint is close to the spread probability.
    close(p.prob, 0.48, 0.01);
    expect(p.correlationLift).toBeGreaterThan(1.5);
  });

  it("uses the typed in SGP price when given", () => {
    const ml = leg("ml", "g1", -150, 0.6, { kind: "ml" });
    const over = leg("ov", "g1", -110, 0.52, { kind: "total", teamSide: null });
    const p = priceParlay([ml, over], { sgpDecimalOverride: 3.2 });
    expect(p.priceIsEstimate).toBe(false);
    expect(p.offeredDecimal).toBe(3.2);
  });

  it("joint probability of opposite legs on the same variable is bounded", () => {
    const over = { prob: 0.5, corr: desc({ kind: "total", direction: 1, teamSide: null }) };
    const under = { prob: 0.5, corr: desc({ kind: "total", direction: -1, teamSide: null }) };
    expect(jointProbability([over, under])).toBeLessThan(0.05);
  });

  it("flags conflicts", () => {
    const a = leg("a", "g1", -110, 0.5);
    const b = { ...leg("b", "g1", -110, 0.5), marketKey: a.marketKey };
    expect(findConflicts([a, a]).length).toBeGreaterThan(0);
    expect(findConflicts([a, b]).length).toBeGreaterThan(0);
    expect(findConflicts([a, leg("c", "g2", -110, 0.5)])).toEqual([]);
  });
});

describe("optimizer", () => {
  const mk = (id: string, eventId: string, american: number, prob: number): OptimizerLeg => {
    const decimal = americanToDecimal(american);
    return {
      id,
      eventId,
      marketKey: `${eventId}|h2h`,
      side: "home",
      decimal,
      prob,
      corr: desc({ eventId }),
      ev: prob * decimal - 1,
      label: id,
    };
  };

  const legs = [
    mk("a", "g1", 100, 0.56),
    mk("b", "g2", 100, 0.55),
    mk("c", "g3", 100, 0.54),
    mk("d", "g4", 100, 0.45),
    mk("a2", "g1", 120, 0.47),
  ];

  it("finds the best positive EV parlays from different games", () => {
    const res = optimizeParlays(legs, { minLegs: 2, maxLegs: 3, objective: "ev" });
    expect(res.parlays.length).toBeGreaterThan(0);
    const best = res.parlays[0];
    const ids = best.legs.map((l) => l.id).sort();
    expect(ids).toEqual(["a", "b", "c"]);
    for (const p of res.parlays) {
      const events = new Set(p.legs.map((l) => l.eventId));
      expect(events.size).toBe(p.legs.length);
    }
  });

  it("respects the leg range and payout limits", () => {
    const res = optimizeParlays(legs, { minLegs: 2, maxLegs: 2, objective: "growth", maxParlayAmerican: 350 });
    for (const p of res.parlays) {
      expect(p.legs.length).toBe(2);
      expect(p.pricing.offeredAmerican).toBeLessThanOrEqual(350);
    }
  });

  it("hit objective prefers likelier parlays that are still +EV", () => {
    const res = optimizeParlays(legs, { minLegs: 2, maxLegs: 3, objective: "hit" });
    const best = res.parlays[0];
    expect(best.legs.length).toBe(2);
    expect(best.pricing.ev).toBeGreaterThan(0);
  });
});
