// Settling bets from final scores. Pure functions so they are easy to test.

export type LegResult = "won" | "lost" | "push" | "void";
export type BetStatus = "open" | LegResult;

export interface SettleableLeg {
  market: string;
  side: string;
  point?: number | null;
}

/**
 * Grades a moneyline, spread or total leg. Props return null (graded by hand).
 * `hasDraw` marks three-way moneylines (soccer), where a draw loses a bet on
 * either team instead of pushing it.
 */
export function gradeLeg(leg: SettleableLeg, homeScore: number, awayScore: number, hasDraw = false): LegResult | null {
  const margin = homeScore - awayScore;
  if (leg.market === "h2h") {
    if (leg.side === "draw") return margin === 0 ? "won" : "lost";
    if (margin === 0) return hasDraw ? "lost" : "push";
    const homeWon = margin > 0;
    return (leg.side === "home") === homeWon ? "won" : "lost";
  }
  if (leg.market === "spreads") {
    if (leg.point === null || leg.point === undefined) return null;
    const sideMargin = leg.side === "home" ? margin : -margin;
    const result = sideMargin + leg.point;
    return result > 0 ? "won" : result < 0 ? "lost" : "push";
  }
  if (leg.market === "totals") {
    if (leg.point === null || leg.point === undefined) return null;
    const total = homeScore + awayScore;
    if (total === leg.point) return "push";
    return (leg.side === "over") === total > leg.point ? "won" : "lost";
  }
  return null;
}

export interface GradedBet {
  status: BetStatus;
  /** Decimal odds actually paid after pushes drop out (before any boost). */
  decimal: number;
}

/**
 * Combines leg results the way a parlay settles: any loss loses, pushes and
 * voids drop out and the remaining legs pay at their own odds.
 */
export function gradeParlay(legs: { decimal: number; result?: LegResult | null }[]): GradedBet {
  if (legs.some((l) => l.result === "lost")) return { status: "lost", decimal: 0 };
  if (legs.some((l) => !l.result)) return { status: "open", decimal: NaN };
  const live = legs.filter((l) => l.result === "won");
  if (!live.length) return { status: legs.every((l) => l.result === "void") ? "void" : "push", decimal: 1 };
  return { status: "won", decimal: live.reduce((acc, l) => acc * l.decimal, 1) };
}
