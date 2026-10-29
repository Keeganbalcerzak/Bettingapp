import "server-only";
import { americanToDecimal, decimalToAmerican } from "../odds/convert";
import { devig } from "../odds/devig";
import { clampProb, gaussian, hashString, invLogit, logit, normCdf, normInv, poissonCdf, seededRng } from "../odds/stats";
import type { SportConfig } from "../sports";
import type { EspnGame } from "./espn";
import type { OddsApiBookmaker, OddsApiEvent, OddsApiMarket, OddsApiOutcome } from "./oddsApi";

// Demo mode: real ESPN schedule, with sportsbook prices simulated around ESPN's
// DraftKings line. Lets the whole app run without an Odds API key. Prices are
// seeded by game and date so they stay put between refreshes.

interface DemoBook {
  key: string;
  title: string;
  /** Total hold the book charges on a two-way market. */
  hold: number;
  /** How far (in logit units) the book's opinion wanders from the true price. */
  noise: number;
  /** Chance the book hangs a different spread/total line. */
  lineShift: number;
}

const DEMO_BOOKS: DemoBook[] = [
  { key: "pinnacle", title: "Pinnacle", hold: 0.025, noise: 0.015, lineShift: 0.05 },
  { key: "betonlineag", title: "BetOnline.ag", hold: 0.035, noise: 0.025, lineShift: 0.1 },
  { key: "draftkings", title: "DraftKings", hold: 0.045, noise: 0.035, lineShift: 0.15 },
  { key: "fanduel", title: "FanDuel", hold: 0.045, noise: 0.05, lineShift: 0.2 },
  { key: "betmgm", title: "BetMGM", hold: 0.05, noise: 0.045, lineShift: 0.2 },
  { key: "williamhill_us", title: "Caesars", hold: 0.05, noise: 0.045, lineShift: 0.2 },
  { key: "betrivers", title: "BetRivers", hold: 0.055, noise: 0.05, lineShift: 0.2 },
];

const DEFAULT_TOTAL: Record<string, number> = {
  americanfootball_nfl: 44.5,
  americanfootball_ncaaf: 52.5,
  basketball_nba: 228.5,
  basketball_ncaab: 145.5,
  icehockey_nhl: 6,
  baseball_mlb: 8.5,
  soccer_epl: 2.5,
  soccer_uefa_champs_league: 2.5,
  soccer_usa_mls: 2.5,
};

/** Spread/total increments the books use. */
function step(sport: SportConfig): number {
  return sport.family === "hockey" || sport.family === "baseball" || sport.family === "soccer" ? 1 : 0.5;
}

function priceTwoWay(pA: number, hold: number, rng: () => number, noise: number): [number, number] {
  // Wobble the book's opinion, then add the vig proportionally.
  const p = invLogit(logit(clampProb(pA)) + gaussian(rng) * noise);
  const total = 1 / (1 - hold);
  const qa = p * total;
  const qb = (1 - p) * total;
  return [roundAmerican(1 / qa), roundAmerican(1 / qb)];
}

function roundAmerican(decimal: number): number {
  const a = decimalToAmerican(Math.max(1.01, decimal));
  if (Math.abs(a) < 100) return a > 0 ? 100 : -100;
  // US books mostly quote in steps of 5 beyond +/-200.
  return Math.abs(a) >= 200 ? Math.round(a / 5) * 5 : a;
}

function fairFromAmericans(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  const [pa] = devig([1 / americanToDecimal(a), 1 / americanToDecimal(b)], "power");
  return Number.isFinite(pa) ? pa : null;
}

export function demoEventId(espnId: string): string {
  return `demo-${espnId}`;
}

export function buildDemoEvent(sport: SportConfig, game: EspnGame, dayKey: string): OddsApiEvent {
  const o = game.odds;
  const sd = sport.marginSd;
  const realDk = !!o && /draft/i.test(o.provider);

  // True prices: devig ESPN's DraftKings line when present, else lean on home edge.
  let pHome = fairFromAmericans(o?.mlHome ?? null, o?.mlAway ?? null);
  let pDraw = 0;
  if (sport.hasDraw) {
    const three =
      o?.mlHome != null && o?.mlAway != null && o?.drawOdds != null
        ? devig([o.mlHome, o.mlAway, o.drawOdds].map((a) => 1 / americanToDecimal(a)), "power")
        : null;
    if (three && three.every(Number.isFinite)) {
      pDraw = three[2];
      pHome = three[0] / (three[0] + three[1]);
    } else {
      pDraw = 0.26;
    }
  }
  let spreadHome = o?.spreadHome ?? null;
  if (pHome === null) pHome = spreadHome !== null ? normCdf(-spreadHome / sd) : normCdf(sport.homeAdv / sd);
  const homeMargin = sd * normInv(clampProb(pHome, 1e-3));
  if (spreadHome === null) {
    spreadHome = -Math.round(homeMargin / step(sport)) * step(sport) || -step(sport) / 2;
  }
  const total = o?.total ?? DEFAULT_TOTAL[sport.key] ?? 45;

  const bookmakers: OddsApiBookmaker[] = DEMO_BOOKS.map((book) => {
    const rng = seededRng(hashString(`${game.id}|${book.key}|${dayKey}`));
    const markets: OddsApiMarket[] = [];
    const useReal = realDk && book.key === "draftkings";

    // Moneyline (three-way for soccer).
    if (sport.hasDraw) {
      let prices: number[];
      if (useReal && o?.mlHome != null && o?.mlAway != null && o?.drawOdds != null) {
        prices = [o.mlHome, o.mlAway, o.drawOdds];
      } else {
        const wobble = (p: number) => clampProb(invLogit(logit(p) + gaussian(rng) * book.noise));
        const raw = [wobble(pHome * (1 - pDraw)), wobble((1 - pHome) * (1 - pDraw)), wobble(pDraw)];
        const sum = raw.reduce((acc, x) => acc + x, 0);
        const k = 1 / (1 - book.hold * 1.4);
        prices = raw.map((p) => roundAmerican(1 / ((p / sum) * k)));
      }
      markets.push({
        key: "h2h",
        outcomes: [
          { name: game.home.name, price: prices[0] },
          { name: game.away.name, price: prices[1] },
          { name: "Draw", price: prices[2] },
        ],
      });
    } else {
      const [h, a] =
        useReal && o?.mlHome != null && o?.mlAway != null ? [o.mlHome, o.mlAway] : priceTwoWay(pHome, book.hold, rng, book.noise);
      markets.push({ key: "h2h", outcomes: [{ name: game.home.name, price: h }, { name: game.away.name, price: a }] });
    }

    // Spread: some books hang a half point (or a full goal/run) off the market line.
    if (!sport.hasDraw) {
      let line = spreadHome!;
      let prices: [number, number];
      if (useReal && o?.spreadHome != null && o.spreadHomeOdds != null && o.spreadAwayOdds != null) {
        prices = [o.spreadHomeOdds, o.spreadAwayOdds];
      } else {
        if (rng() < book.lineShift) line += (rng() < 0.5 ? -1 : 1) * step(sport);
        if (line === 0) line = -step(sport) / 2;
        prices = priceTwoWay(normCdf((homeMargin + line) / sd), book.hold, rng, book.noise);
      }
      markets.push({
        key: "spreads",
        outcomes: [
          { name: game.home.name, price: prices[0], point: line },
          { name: game.away.name, price: prices[1], point: -line },
        ],
      });
    }

    // Total.
    let totalLine = total;
    let totalPrices: [number, number];
    if (useReal && o?.total != null && o.overOdds != null && o.underOdds != null) {
      totalPrices = [o.overOdds, o.underOdds];
    } else {
      if (rng() < book.lineShift) totalLine += (rng() < 0.5 ? -1 : 1) * (sport.family === "soccer" ? 0.5 : step(sport));
      totalPrices = priceTwoWay(normCdf((total - totalLine) / sport.totalSd), book.hold, rng, book.noise);
    }
    const totals: OddsApiOutcome[] = [
      { name: "Over", price: totalPrices[0], point: totalLine },
      { name: "Under", price: totalPrices[1], point: totalLine },
    ];
    markets.push({ key: "totals", outcomes: totals });

    return { key: book.key, title: book.title, markets };
  });

  return {
    id: demoEventId(game.id),
    sport_key: sport.key,
    sport_title: sport.label,
    commence_time: game.date,
    home_team: game.home.name,
    away_team: game.away.name,
    bookmakers,
  };
}

export interface DemoPropSeed {
  player: string;
  market: string;
  /** Recent per-game values, newest first. */
  values: number[];
  yesNo: boolean;
  count: boolean;
  /** Spread as a share of the average for continuous stats (see PropMarketDef.cv). */
  cv: number | null;
}

/** Main prop line near the middle of the player's distribution, like books post. */
function propLine(avg: number, count: boolean, cv: number | null): { line: number; pOver: (line: number) => number; step: number } {
  if (count) {
    const lambda = Math.max(0.2, avg);
    const pOver = (line: number) => 1 - poissonCdf(Math.floor(line), lambda);
    let k = 0;
    while (pOver(k + 0.5) > 0.56 && k < 60) k++;
    return { line: k + 0.5, pOver, step: 1 };
  }
  const sd = Math.max(1.5, (cv ?? 0.35) * Math.max(avg, 1));
  const pOver = (line: number) => 1 - normCdf((line - avg) / sd);
  const base = Math.round(avg * 2) / 2;
  const step = avg >= 60 ? 5 : avg >= 25 ? 2 : 1;
  return { line: Number.isInteger(base) ? base + 0.5 : base, pOver, step };
}

/**
 * Simulated FanDuel + consensus prices for player props, built around each
 * player's recent average so the hit-rate analysis has something real to chew on.
 */
export function buildDemoProps(eventId: string, seeds: DemoPropSeed[], dayKey: string): OddsApiBookmaker[] {
  const books = DEMO_BOOKS.filter((b) => ["pinnacle", "draftkings", "fanduel", "betmgm", "williamhill_us"].includes(b.key));
  return books.map((book) => {
    const byMarket = new Map<string, OddsApiOutcome[]>();
    for (const seed of seeds) {
      const recent = seed.values.slice(0, 10);
      if (recent.length < 3) continue;
      const rng = seededRng(hashString(`${eventId}|${seed.player}|${seed.market}|${book.key}|${dayKey}`));
      const avg = recent.reduce((acc, x) => acc + x, 0) / recent.length;
      const list = byMarket.get(seed.market) ?? [];
      if (seed.yesNo) {
        const p = clampProb(1 - Math.exp(-Math.max(0.05, avg)), 0.05);
        const [yes, no] = priceTwoWay(p, book.hold * 1.6, rng, book.noise * 1.5);
        list.push({ name: "Yes", description: seed.player, price: yes });
        if (book.key !== "fanduel") list.push({ name: "No", description: seed.player, price: no });
      } else {
        const count = seed.count;
        const { line, pOver, step: lineStep } = propLine(avg, count, seed.cv);
        const shifted = rng() < book.lineShift * 0.6 ? Math.max(0.5, line + (rng() < 0.5 ? -1 : 1) * lineStep) : line;
        const [ov, un] = priceTwoWay(clampProb(pOver(shifted), 0.08), book.hold * 1.5, rng, book.noise * 1.3);
        list.push({ name: "Over", description: seed.player, price: ov, point: shifted });
        list.push({ name: "Under", description: seed.player, price: un, point: shifted });
      }
      byMarket.set(seed.market, list);
    }
    return {
      key: book.key,
      title: book.title,
      markets: [...byMarket.entries()].map(([key, outcomes]) => ({ key, outcomes })),
    };
  });
}
