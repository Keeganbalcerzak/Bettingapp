import { describe, expect, it } from "vitest";
import { fanDuelBetslipUrl, parseFanDuelLink } from "./fanduel";
import { gradeLeg, gradeParlay } from "./settle";

describe("gradeLeg", () => {
  it("grades moneylines", () => {
    expect(gradeLeg({ market: "h2h", side: "home" }, 24, 20)).toBe("won");
    expect(gradeLeg({ market: "h2h", side: "away" }, 24, 20)).toBe("lost");
    expect(gradeLeg({ market: "h2h", side: "draw" }, 1, 1, true)).toBe("won");
    expect(gradeLeg({ market: "h2h", side: "draw" }, 2, 1, true)).toBe("lost");
    // A soccer draw loses a bet on either team; a tie in a two-way moneyline pushes.
    expect(gradeLeg({ market: "h2h", side: "home" }, 1, 1, true)).toBe("lost");
    expect(gradeLeg({ market: "h2h", side: "away" }, 1, 1, true)).toBe("lost");
    expect(gradeLeg({ market: "h2h", side: "home" }, 20, 20)).toBe("push");
  });

  it("grades spreads with pushes", () => {
    expect(gradeLeg({ market: "spreads", side: "home", point: -3 }, 24, 20)).toBe("won");
    expect(gradeLeg({ market: "spreads", side: "home", point: -3 }, 23, 20)).toBe("push");
    expect(gradeLeg({ market: "spreads", side: "away", point: 3.5 }, 23, 20)).toBe("won");
    expect(gradeLeg({ market: "spreads", side: "away", point: 2.5 }, 23, 20)).toBe("lost");
  });

  it("grades totals", () => {
    expect(gradeLeg({ market: "totals", side: "over", point: 44.5 }, 24, 21)).toBe("won");
    expect(gradeLeg({ market: "totals", side: "under", point: 44.5 }, 24, 21)).toBe("lost");
    expect(gradeLeg({ market: "totals", side: "over", point: 45 }, 24, 21)).toBe("push");
    expect(gradeLeg({ market: "player_points", side: "over", point: 20.5 }, 1, 0)).toBeNull();
  });
});

describe("gradeParlay", () => {
  it("loses on any losing leg and drops pushes", () => {
    expect(gradeParlay([{ decimal: 2, result: "won" }, { decimal: 2, result: "lost" }]).status).toBe("lost");
    expect(gradeParlay([{ decimal: 2, result: "won" }, { decimal: 3, result: "push" }])).toEqual({ status: "won", decimal: 2 });
    expect(gradeParlay([{ decimal: 2, result: "won" }, { decimal: 3 }]).status).toBe("open");
    expect(gradeParlay([{ decimal: 2, result: "push" }]).status).toBe("push");
  });
});

describe("fanduel links", () => {
  it("parses the Odds API betslip link", () => {
    expect(parseFanDuelLink("https://sportsbook.fanduel.com/addToBetslip?marketId=42.448600011&selectionId=29165")).toEqual({
      marketId: "42.448600011",
      selectionId: "29165",
    });
    expect(parseFanDuelLink("https://sportsbook.fanduel.com/baseball/mlb/x-33617147")).toBeNull();
    expect(parseFanDuelLink(null)).toBeNull();
  });

  it("builds single and multi leg links", () => {
    expect(fanDuelBetslipUrl([{ marketId: "1.2", selectionId: "3" }])).toBe(
      "https://sportsbook.fanduel.com/addToBetslip?marketId=1.2&selectionId=3",
    );
    const multi = fanDuelBetslipUrl([
      { marketId: "1.2", selectionId: "3" },
      { marketId: "4.5", selectionId: "6" },
    ]);
    expect(multi).toBe("https://sportsbook.fanduel.com/addToBetslip?marketId%5B0%5D=1.2&selectionId%5B0%5D=3&marketId%5B1%5D=4.5&selectionId%5B1%5D=6");
    const parsed = new URL(multi!);
    expect(parsed.searchParams.get("marketId[1]")).toBe("4.5");
    expect(fanDuelBetslipUrl([], "nj.sportsbook.fanduel.com")).toBeNull();
    expect(fanDuelBetslipUrl([{ marketId: "1", selectionId: "2" }], "https://sportsbook.fanduel.ca/")).toContain("https://sportsbook.fanduel.ca/addToBetslip");
  });
});
