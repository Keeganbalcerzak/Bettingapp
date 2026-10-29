import "server-only";
import { bookInfo, TARGET_BOOK } from "../books";
import { parseFanDuelLink } from "../fanduel";
import { blendCapped, consensusProb, shiftProb, winThreshold, type BookProb, type Consensus } from "../odds/consensus";
import { americanToDecimal, formatPct, formatPoint } from "../odds/convert";
import type { CorrDescriptor } from "../odds/correlation";
import { devig, hold, type DevigMethod } from "../odds/devig";
import { expectedValue, kellyFraction } from "../odds/ev";
import { clamp } from "../odds/stats";
import { marketLabel, type SportConfig } from "../sports";
import type { AnalysisSettings, AnalyzedLeg, GameInfo, Quote, Side, Signal } from "../types";
import { legInfo, type GameContext } from "./info";
import type { OddsApiBookmaker, OddsApiEvent, OddsApiMarket, OddsApiOutcome } from "./oddsApi";

export const GAME_MARKETS = ["h2h", "spreads", "totals"] as const;

/** Most the info layer can move a market probability at the default weight (3 points). */
export const MAX_INFO_SHIFT = 0.03;

/**
 * 0-100 summary of how much the evidence lines up behind a bet. The market edge
 * sets the base; info signals push it up or down. It is a ranking aid, not a
 * probability.
 */
export function confidenceScore(marketEv: number, consensus: Consensus | null, signals: Signal[]): number {
  let score = 50 + clamp(marketEv * 450, -32, 32);
  if (!consensus) score -= 15;
  else {
    if (consensus.sharpBooks > 0) score += 5;
    if (consensus.books < 3) score -= 6;
    if (consensus.lineAdjusted) score -= 3;
  }
  for (const s of signals) if (s.category !== "market" && s.category !== "price") score += s.effect * s.weight;
  return Math.round(clamp(score, 1, 99));
}

export function marketSignals(marketEv: number, consensus: Consensus | null, fdHoldPct: number | null, best: Quote | null, fdAmerican: number): Signal[] {
  const out: Signal[] = [];
  if (consensus) {
    const sharp = consensus.sharpBooks ? `${consensus.sharpBooks} sharp` : "no sharp";
    out.push({
      id: "edge",
      category: "market",
      label: marketEv > 0 ? `Beats the sharp line by ${(marketEv * 100).toFixed(1)}%` : `Market alone: ${(marketEv * 100).toFixed(1)}% EV`,
      detail: `${marketEv > 0 ? "+" : ""}${(marketEv * 100).toFixed(1)}% EV against a no-vig line from ${consensus.books} book${consensus.books === 1 ? "" : "s"} (${sharp})${consensus.lineAdjusted ? ", some adjusted to FanDuel's line" : ""}.`,
      effect: clamp(marketEv / 0.04, -1, 1),
      weight: 0,
    });
  } else {
    out.push({
      id: "edge",
      category: "market",
      label: "No outside prices to compare",
      detail: "Only FanDuel has this market, so the fair price is FanDuel's own price with the vig removed. There is no edge signal here.",
      effect: -0.3,
      weight: 0,
    });
  }
  if (fdHoldPct !== null) {
    out.push({
      id: "hold",
      category: "price",
      label: `FanDuel hold ${formatPct(fdHoldPct)}`,
      detail: "The cut FanDuel takes on this market. Lower is better for you.",
      effect: fdHoldPct > 0.06 ? -0.5 : 0,
      weight: 0,
    });
  }
  if (best && best.book !== TARGET_BOOK && best.american !== fdAmerican) {
    out.push({
      id: "best-price",
      category: "price",
      label: `Better price at ${bookInfo(best.book).title}`,
      detail: `${bookInfo(best.book).title} has ${best.american > 0 ? "+" : ""}${best.american} vs FanDuel ${fdAmerican > 0 ? "+" : ""}${fdAmerican}.`,
      effect: 0,
      weight: 0,
    });
  }
  return out;
}

function sideOf(market: string, outcome: OddsApiOutcome, event: OddsApiEvent): Side | null {
  if (market === "totals") return /^over$/i.test(outcome.name) ? "over" : /^under$/i.test(outcome.name) ? "under" : null;
  if (outcome.name === event.home_team) return "home";
  if (outcome.name === event.away_team) return "away";
  if (/^draw$/i.test(outcome.name) || /^tie$/i.test(outcome.name)) return "draw";
  return null;
}

/** Fair probability of `side` at this book, plus the line it was priced at. */
function bookFair(market: OddsApiMarket, event: OddsApiEvent, side: Side, method: DevigMethod): { prob: number; point: number | null } | null {
  const outcomes = market.outcomes.filter((o) => Number.isFinite(o.price) && o.price !== 0);
  if (outcomes.length < 2) return null;
  if (market.key === "h2h") {
    const fair = devig(outcomes.map((o) => 1 / americanToDecimal(o.price)), method);
    const idx = outcomes.findIndex((o) => sideOf("h2h", o, event) === side);
    return idx >= 0 && Number.isFinite(fair[idx]) ? { prob: fair[idx], point: null } : null;
  }
  // Spreads/totals: pair the side with its opposite at the matching line.
  const mine = outcomes.find((o) => sideOf(market.key, o, event) === side);
  const minePoint = mine?.point;
  if (!mine || minePoint === undefined) return null;
  const opposite = outcomes.find((o) => {
    const s = sideOf(market.key, o, event);
    if (!s || s === side) return false;
    return market.key === "totals" ? o.point === minePoint : o.point === -minePoint;
  });
  if (!opposite) return null;
  const [p] = devig([1 / americanToDecimal(mine.price), 1 / americanToDecimal(opposite.price)], method);
  return Number.isFinite(p) ? { prob: p, point: minePoint } : null;
}

function legLabel(market: string, side: Side, event: OddsApiEvent, point: number | null): string {
  const team = side === "home" ? event.home_team : side === "away" ? event.away_team : "";
  if (market === "h2h") return side === "draw" ? `Draw (${event.away_team} @ ${event.home_team})` : `${team} ML`;
  if (market === "spreads") return `${team} ${formatPoint(point)}`;
  return `${side === "over" ? "Over" : "Under"} ${point}`;
}

export interface GameAnalysisInput {
  sport: SportConfig;
  event: OddsApiEvent;
  ctx: GameContext;
  info: GameInfo | null;
  settings: AnalysisSettings;
  demo: boolean;
}

export function analyzeGameLines({ sport, event, ctx, info, settings, demo }: GameAnalysisInput): AnalyzedLeg[] {
  const books: OddsApiBookmaker[] = event.bookmakers ?? [];
  const fd = books.find((b) => b.key === TARGET_BOOK);
  if (!fd) return [];
  const others = books.filter((b) => b.key !== TARGET_BOOK);
  const legs: AnalyzedLeg[] = [];

  const fdH2h = fd.markets.find((m) => m.key === "h2h");
  const homePrice = fdH2h?.outcomes.find((o) => o.name === event.home_team)?.price;
  const awayPrice = fdH2h?.outcomes.find((o) => o.name === event.away_team)?.price;
  const homeFavored = homePrice !== undefined && awayPrice !== undefined ? homePrice < awayPrice : null;

  for (const marketKey of GAME_MARKETS) {
    if (marketKey === "spreads" && sport.hasDraw) continue;
    const fdMarket = fd.markets.find((m) => m.key === marketKey);
    if (!fdMarket) continue;
    const fdImplied = fdMarket.outcomes.map((o) => 1 / americanToDecimal(o.price));
    const fdHold = fdImplied.length >= 2 ? hold(fdImplied) : null;

    for (const outcome of fdMarket.outcomes) {
      const side = sideOf(marketKey, outcome, event);
      if (!side) continue;
      const point = outcome.point ?? null;
      const fdDecimal = americanToDecimal(outcome.price);
      if (!Number.isFinite(fdDecimal)) continue;

      // Fair probability from every other book, moved onto FanDuel's line when needed.
      const inputs: BookProb[] = [];
      const quotes: Quote[] = [{ book: TARGET_BOOK, american: outcome.price, point }];
      for (const b of others) {
        const m = b.markets.find((x) => x.key === marketKey);
        if (!m) continue;
        const q = m.outcomes.find((o) => sideOf(marketKey, o, event) === side);
        if (q) quotes.push({ book: b.key, american: q.price, point: q.point ?? null });
        const fair = bookFair(m, event, side, settings.method);
        if (!fair) continue;
        const info = bookInfo(b.key);
        let prob = fair.prob;
        let adjusted = false;
        if (marketKey !== "h2h" && fair.point !== null && point !== null && fair.point !== point) {
          const sd = marketKey === "spreads" ? sport.marginSd : sport.totalSd;
          if (Math.abs(fair.point - point) > sd * 0.35) continue;
          const kind = marketKey === "spreads" ? "spread" : side === "over" ? "over" : "under";
          prob = shiftProb(prob, winThreshold(kind, fair.point), winThreshold(kind, point), sd);
          adjusted = true;
        }
        inputs.push({ book: b.key, prob, weight: info.weight, sharp: info.sharp, lineAdjusted: adjusted });
      }
      const consensus = consensusProb(inputs);
      const fdOwn = bookFair(fdMarket, event, side, settings.method);
      const fairProb = consensus?.prob ?? fdOwn?.prob ?? NaN;
      if (!Number.isFinite(fairProb)) continue;

      const li = legInfo(ctx, info, { market: marketKey, side, point, fairProb });
      const infoWeight = li.prob !== null ? li.weight * settings.infoWeight : 0;
      const modelProb = blendCapped(fairProb, li.prob, infoWeight, MAX_INFO_SHIFT * settings.infoWeight);
      const ev = expectedValue(modelProb, fdDecimal);
      const marketEv = expectedValue(fairProb, fdDecimal);

      const samePoint = quotes.filter((q) => (q.point ?? null) === point);
      const best = samePoint.reduce<Quote | null>((acc, q) => (!acc || americanToDecimal(q.american) > americanToDecimal(acc.american) ? q : acc), null);
      const signals = [...marketSignals(marketEv, consensus, fdHold, best, outcome.price), ...li.signals];
      const parsed = parseFanDuelLink(outcome.link);
      const teamSide = side === "home" || side === "away" ? side : null;
      const corr: CorrDescriptor = {
        sport: sport.key,
        eventId: event.id,
        kind: marketKey === "h2h" ? "ml" : marketKey === "spreads" ? "spread" : "total",
        teamSide,
        direction: side === "under" ? -1 : 1,
        homeFavored,
      };
      if (marketKey === "h2h" && side === "draw") corr.kind = "other";

      legs.push({
        id: `${event.id}|${marketKey}|${side}|${point ?? ""}`,
        eventId: event.id,
        espnId: info?.espnId || null,
        sport: sport.key,
        sportLabel: sport.short,
        home: event.home_team,
        away: event.away_team,
        homeAbbr: info?.home.abbr ?? null,
        awayAbbr: info?.away.abbr ?? null,
        commenceTime: event.commence_time,
        market: marketKey,
        marketLabel: marketLabel(sport.key, marketKey),
        side,
        team: teamSide,
        player: null,
        point,
        label: legLabel(marketKey, side, event, point),
        fd: {
          american: outcome.price,
          decimal: fdDecimal,
          link: outcome.link ?? null,
          marketId: parsed?.marketId ?? null,
          selectionId: parsed?.selectionId ?? outcome.sid ?? null,
        },
        fairProb,
        infoProb: li.prob,
        infoWeight,
        modelProb,
        ev,
        marketEv,
        kelly: kellyFraction(modelProb, fdDecimal),
        fdHold,
        consensus: {
          books: consensus?.books ?? 0,
          sharpBooks: consensus?.sharpBooks ?? 0,
          lineAdjusted: consensus?.lineAdjusted ?? false,
          oneSided: false,
          method: settings.method,
          source: consensus ? "consensus" : "fanduel-only",
        },
        best,
        quotes,
        confidence: confidenceScore(marketEv, consensus, signals),
        signals,
        corr,
        demo,
      });
    }
  }
  return legs;
}
