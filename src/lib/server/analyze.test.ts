import { describe, expect, it } from "vitest";
import { slipLink } from "../legs";
import { americanToDecimal } from "../odds/convert";
import { getSport } from "../sports";
import { DEFAULT_ANALYSIS } from "../types";
import { analyzeGameLines } from "./analyze";
import { matchEvent, nameSimilarity, normalizePlayer } from "./match";
import type { OddsApiEvent } from "./oddsApi";

// Shaped like a real /v4/sports/{sport}/odds response with includeLinks=true.
const fdLink = (sel: string) => `https://sportsbook.fanduel.com/addToBetslip?marketId=42.1&selectionId=${sel}`;
const event: OddsApiEvent = {
  id: "evt1",
  sport_key: "americanfootball_nfl",
  commence_time: "2026-11-01T18:00:00Z",
  home_team: "Buffalo Bills",
  away_team: "Baltimore Ravens",
  bookmakers: [
    {
      key: "fanduel",
      title: "FanDuel",
      link: "https://sportsbook.fanduel.com/football/nfl/baltimore-ravens-@-buffalo-bills-1",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Buffalo Bills", price: -150, link: fdLink("1") },
            { name: "Baltimore Ravens", price: 135, link: fdLink("2") },
          ],
        },
        {
          key: "spreads",
          outcomes: [
            { name: "Buffalo Bills", price: -110, point: -3.5, link: fdLink("3") },
            { name: "Baltimore Ravens", price: -110, point: 3.5, link: fdLink("4") },
          ],
        },
        {
          key: "totals",
          outcomes: [
            { name: "Over", price: -105, point: 54.5, link: fdLink("5") },
            { name: "Under", price: -115, point: 54.5, link: fdLink("6") },
          ],
        },
      ],
    },
    {
      key: "pinnacle",
      title: "Pinnacle",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Buffalo Bills", price: -160 },
            { name: "Baltimore Ravens", price: 146 },
          ],
        },
        {
          key: "spreads",
          outcomes: [
            { name: "Buffalo Bills", price: -105, point: -3 },
            { name: "Baltimore Ravens", price: -105, point: 3 },
          ],
        },
        {
          key: "totals",
          outcomes: [
            { name: "Over", price: 102, point: 54.5 },
            { name: "Under", price: -112, point: 54.5 },
          ],
        },
      ],
    },
    {
      key: "draftkings",
      title: "DraftKings",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Buffalo Bills", price: -165 },
            { name: "Baltimore Ravens", price: 140 },
          ],
        },
      ],
    },
  ],
};

describe("analyzeGameLines", () => {
  const sport = getSport("americanfootball_nfl")!;
  const legs = analyzeGameLines({
    sport,
    event,
    ctx: { sport, game: null, summary: null, standings: null, weather: null },
    info: null,
    settings: DEFAULT_ANALYSIS,
    demo: false,
  });

  it("produces one leg per FanDuel outcome with betslip ids", () => {
    expect(legs).toHaveLength(6);
    const bills = legs.find((l) => l.market === "h2h" && l.side === "home")!;
    expect(bills.fd.american).toBe(-150);
    expect(bills.fd.marketId).toBe("42.1");
    expect(bills.fd.selectionId).toBe("1");
    expect(bills.label).toBe("Buffalo Bills ML");
    expect(bills.consensus.books).toBe(2);
    expect(bills.consensus.sharpBooks).toBe(1);
  });

  it("prices FanDuel against the sharp consensus", () => {
    const ravens = legs.find((l) => l.market === "h2h" && l.side === "away")!;
    // Pinnacle and DK both have the Ravens shorter than +135, so FanDuel's price is worse.
    expect(ravens.marketEv).toBeLessThan(0);
    const over = legs.find((l) => l.market === "totals" && l.side === "over")!;
    const under = legs.find((l) => l.market === "totals" && l.side === "under")!;
    // Pinnacle leans under (-112 vs +102), so FanDuel's -115 under is closer to fair than its -105 over.
    expect(over.fairProb).toBeLessThan(0.5);
    expect(under.marketEv).toBeGreaterThan(over.marketEv);
    expect(over.marketEv).toBeCloseTo(0.4838 * americanToDecimal(-105) - 1, 2);
    for (const l of legs) {
      expect(l.fairProb).toBeGreaterThan(0);
      expect(l.fairProb).toBeLessThan(1);
      expect(Math.abs(l.ev - (l.modelProb * americanToDecimal(l.fd.american) - 1))).toBeLessThan(1e-9);
    }
  });

  it("moves other books onto FanDuel's spread", () => {
    const billsSpread = legs.find((l) => l.market === "spreads" && l.side === "home")!;
    expect(billsSpread.consensus.lineAdjusted).toBe(true);
    // Pinnacle prices -3 at a coin flip; -3.5 has to be less likely than that.
    expect(billsSpread.fairProb).toBeLessThan(0.5);
    expect(billsSpread.best?.book).toBe("fanduel");
  });

  it("builds a FanDuel parlay link from the legs", () => {
    const picks = [legs.find((l) => l.market === "h2h" && l.side === "home")!, legs.find((l) => l.market === "totals" && l.side === "over")!];
    const link = slipLink(picks);
    expect(link.linked).toBe(2);
    expect(link.url).toContain("marketId%5B0%5D=42.1&selectionId%5B0%5D=1");
    expect(link.url).toContain("selectionId%5B1%5D=5");
  });
});

describe("matching", () => {
  it("scores real-world name variants", () => {
    expect(nameSimilarity("Brighton and Hove Albion", "Brighton & Hove Albion")).toBe(1);
    expect(nameSimilarity("Bournemouth", "AFC Bournemouth")).toBe(1);
    expect(nameSimilarity("San José State Spartans", "San Jose State Spartans")).toBe(1);
    expect(nameSimilarity("Los Angeles Clippers", "Clippers")).toBeGreaterThan(0.6);
    expect(nameSimilarity("New York Jets", "New York Giants")).toBeLessThan(0.6);
  });

  it("matches events by teams and start time", () => {
    const candidates = [
      { id: "a", home: "New York Jets", away: "Las Vegas Raiders", date: "2026-11-01T18:00Z" },
      { id: "b", home: "LA Clippers", away: "Minnesota Timberwolves", homeAliases: ["Clippers"], awayAliases: ["Timberwolves"], date: "2026-10-31T00:00Z" },
    ];
    expect(matchEvent({ home: "New York Jets", away: "Las Vegas Raiders", date: "2026-11-01T18:00:00Z" }, candidates)?.id).toBe("a");
    expect(matchEvent({ home: "Los Angeles Clippers", away: "Minnesota Timberwolves", date: "2026-10-31T00:10:00Z" }, candidates)?.id).toBe("b");
    expect(matchEvent({ home: "New York Jets", away: "Las Vegas Raiders", date: "2026-11-08T18:00:00Z" }, candidates)).toBeNull();
  });

  it("normalizes player names", () => {
    expect(normalizePlayer("James Cook III")).toBe("james cook");
    expect(normalizePlayer("Amon-Ra St. Brown")).toBe("amonra st brown");
    expect(normalizePlayer("Luka Dončić")).toBe("luka doncic");
  });
});
