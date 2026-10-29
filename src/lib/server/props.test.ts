import { describe, expect, it } from "vitest";
import { propDef } from "../sports";
import type { GameLogEntry } from "./espn";
import { bookPropFair, buildPropStats, shiftPropProb, statValues } from "./props";

const points = propDef("basketball_nba", "player_points")!;
const rebounds = propDef("basketball_nba", "player_rebounds")!;
const anytimeTd = propDef("americanfootball_nfl", "player_anytime_td")!;

describe("prop pricing", () => {
  it("devigs a two-way prop at the same line", () => {
    const fair = bookPropFair(points, [
      { name: "Over", description: "A", price: -115, point: 24.5 },
      { name: "Under", description: "A", price: -105, point: 24.5 },
    ], "over", 24.5, "power", true);
    expect(fair).not.toBeNull();
    expect(fair!.adjusted).toBe(false);
    expect(fair!.prob).toBeGreaterThan(0.5);
    expect(fair!.prob).toBeLessThan(0.53);
  });

  it("moves a book's line onto FanDuel's", () => {
    const fair = bookPropFair(points, [
      { name: "Over", description: "A", price: -110, point: 24.5 },
      { name: "Under", description: "A", price: -110, point: 24.5 },
    ], "over", 25.5, "power", true);
    expect(fair!.adjusted).toBe(true);
    expect(fair!.prob).toBeLessThan(0.5);
    // Count stats shift with a Poisson model.
    expect(shiftPropProb(rebounds, 0.5, "over", 8.5, 9.5)).toBeLessThan(0.5);
    expect(shiftPropProb(rebounds, 0.5, "under", 8.5, 9.5)).toBeGreaterThan(0.5);
  });

  it("refuses lines that are too far apart", () => {
    const fair = bookPropFair(points, [
      { name: "Over", description: "A", price: -110, point: 18.5 },
      { name: "Under", description: "A", price: -110, point: 18.5 },
    ], "over", 26.5, "power", true);
    expect(fair).toBeNull();
  });

  it("handles one-sided yes markets", () => {
    const fair = bookPropFair(anytimeTd, [{ name: "Yes", description: "A", price: 150 }], "yes", null, "power", false);
    expect(fair!.oneSided).toBe(true);
    expect(fair!.prob).toBeCloseTo(0.4 * 0.92, 6);
  });
});

describe("game log stats", () => {
  it("sums stat columns and counts hits", () => {
    const log: GameLogEntry[] = [
      { eventId: "1", date: "2026-10-28", stats: { points: 30, totalRebounds: 5 } },
      { eventId: "2", date: "2026-10-26", stats: { points: 20, totalRebounds: 7 } },
      { eventId: "3", date: "2026-10-24", stats: { points: 25 } },
      { eventId: "4", date: "2026-10-22", stats: { points: 28 } },
    ];
    expect(statValues(points, log)).toEqual([30, 20, 25, 28]);
    const stats = buildPropStats(points, [30, 20, 25, 28, 22, 31, 19, 27, 26, 24], [], 24.5, "over", 0.5)!;
    expect(stats.hitsL10).toBe(6);
    expect(stats.gamesL10).toBe(10);
    expect(stats.modelProb).toBeGreaterThan(0.5);
    const under = buildPropStats(points, [30, 20, 25, 28, 22, 31, 19, 27, 26, 24], [], 24.5, "under", 0.5)!;
    expect(under.modelProb! + stats.modelProb!).toBeCloseTo(1, 6);
    expect(buildPropStats(points, [30, 20], [], 24.5, "over", 0.5)).toBeNull();
  });
});
