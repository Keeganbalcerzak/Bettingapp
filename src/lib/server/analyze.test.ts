import { describe, expect, it } from "vitest";
import { slipLink } from "../legs";
import { americanToDecimal } from "../odds/convert";
import { getSport } from "../sports";
import { DEFAULT_ANALYSIS } from "../types";
import { analyzeGameLines } from "./analyze";
import { flipGame, flipSummary, type EspnGame, type EspnSummary } from "./espn";
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
    const jets = matchEvent({ home: "New York Jets", away: "Las Vegas Raiders", date: "2026-11-01T18:00:00Z" }, candidates);
    expect(jets?.match.id).toBe("a");
    expect(jets?.flipped).toBe(false);
    expect(matchEvent({ home: "Los Angeles Clippers", away: "Minnesota Timberwolves", date: "2026-10-31T00:10:00Z" }, candidates)?.match.id).toBe("b");
    expect(matchEvent({ home: "New York Jets", away: "Las Vegas Raiders", date: "2026-11-08T18:00:00Z" }, candidates)).toBeNull();
  });

  it("reports when the other feed lists home and away the other way round", () => {
    const candidates = [{ id: "c", home: "Miami Dolphins", away: "Kansas City Chiefs", date: "2026-11-08T14:30Z" }];
    const m = matchEvent({ home: "Kansas City Chiefs", away: "Miami Dolphins", date: "2026-11-08T14:30:00Z" }, candidates);
    expect(m?.match.id).toBe("c");
    expect(m?.flipped).toBe(true);
  });

  it("normalizes player names", () => {
    expect(normalizePlayer("James Cook III")).toBe("james cook");
    expect(normalizePlayer("Amon-Ra St. Brown")).toBe("amonra st brown");
    expect(normalizePlayer("Luka Dončić")).toBe("luka doncic");
  });
});

describe("flipping ESPN orientation", () => {
  const team = (id: string, name: string) => ({
    id,
    name,
    shortName: name,
    abbr: id,
    location: "",
    nickname: name,
    logo: null,
    score: null,
    record: null,
    homeRecord: null,
    awayRecord: null,
  });
  const game: EspnGame = {
    id: "g",
    date: "2026-11-08T14:30Z",
    name: "KC at MIA",
    state: "pre",
    statusDetail: "",
    completed: false,
    neutralSite: true,
    home: team("MIA", "Miami Dolphins"),
    away: team("KC", "Kansas City Chiefs"),
    venue: { name: null, city: null, state: null, indoor: null },
    weather: null,
    broadcast: null,
    odds: { provider: "DK", spreadHome: 3, total: 47.5, mlHome: 140, mlAway: -165, spreadHomeOdds: -105, spreadAwayOdds: -115, overOdds: -110, underOdds: -110, drawOdds: null },
    movement: { provider: "DK", spreadOpen: 2.5, spreadNow: 3, totalOpen: 47, totalNow: 47.5, mlHomeOpen: 130, mlHomeNow: 140, mlAwayOpen: -150, mlAwayNow: -165 },
  };

  it("swaps teams, prices and line movement", () => {
    const f = flipGame(game);
    expect(f.home.abbr).toBe("KC");
    expect(f.away.abbr).toBe("MIA");
    expect(f.odds?.spreadHome).toBe(-3);
    expect(f.odds?.mlHome).toBe(-165);
    expect(f.odds?.spreadHomeOdds).toBe(-115);
    expect(f.odds?.total).toBe(47.5);
    expect(f.movement?.spreadNow).toBe(-3);
    expect(f.movement?.mlHomeNow).toBe(-165);
    expect(f.movement?.totalNow).toBe(47.5);
  });

  it("swaps summary ids, scores and the predictor", () => {
    const summary = {
      espnId: "g",
      homeId: "MIA",
      awayId: "KC",
      state: "post",
      completed: true,
      statusDetail: "Final",
      homeScore: 20,
      awayScore: 27,
      predictor: { home: 0.3, away: 0.7, tie: null },
      injuries: {},
      recent: {},
      standings: {},
      leaders: {},
      weather: null,
      venue: { name: null, city: null, state: null, indoor: null },
      movement: null,
    } satisfies EspnSummary;
    const f = flipSummary(summary);
    expect(f.homeId).toBe("KC");
    expect(f.homeScore).toBe(27);
    expect(f.awayScore).toBe(20);
    expect(f.predictor?.home).toBe(0.7);
  });
});
