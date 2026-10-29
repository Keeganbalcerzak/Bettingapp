import "server-only";
import { bookInfo, TARGET_BOOK } from "../books";
import { parseFanDuelLink } from "../fanduel";
import { blendCapped, consensusProb, shiftProb, type BookProb } from "../odds/consensus";
import { americanToDecimal } from "../odds/convert";
import { devig, devigOneSided, hold } from "../odds/devig";
import { expectedValue, kellyFraction } from "../odds/ev";
import { clamp, clampProb, normCdf, poissonCdf } from "../odds/stats";
import { getSport, type PropMarketDef, type SportConfig } from "../sports";
import type { AnalysisSettings, AnalyzedLeg, PropStats, PropsResponse, Quote, Side, Signal } from "../types";
import { confidenceScore, marketSignals, MAX_INFO_SHIFT } from "./analyze";
import { dataMode, dayKey, getSportBoard } from "./board";
import { buildDemoProps, type DemoPropSeed } from "./demo";
import { getGameLog, getRoster, type EspnAthlete, type GameLogEntry } from "./espn";
import { mapLimitSettled } from "./http";
import { normalizePlayer } from "./match";
import { getEventOdds, getUsage, type OddsApiBookmaker, type OddsApiOutcome } from "./oddsApi";

const MAX_PLAYERS = 36;

interface PlayerRef {
  athlete: EspnAthlete;
  teamSide: "home" | "away";
}

function sideOf(name: string): Side | null {
  const n = name.toLowerCase();
  if (n === "over") return "over";
  if (n === "under") return "under";
  if (n === "yes") return "yes";
  if (n === "no") return "no";
  return null;
}

function isPositive(side: Side): boolean {
  return side === "over" || side === "yes";
}

/** Spread of a continuous stat around `level`, proportional to its size. */
export function propSd(def: PropMarketDef, level: number): number {
  return Math.max(1, (def.cv ?? 0.35) * Math.max(level, 1));
}

/** P(stat > line) under a simple distribution, used to move probabilities between prop lines. */
function overProb(def: PropMarketDef, center: number, line: number): number {
  if (def.count) {
    return 1 - poissonCdf(Math.floor(line), Math.max(0.05, center));
  }
  return 1 - normCdf((line - center) / propSd(def, center));
}

/** Finds the Poisson rate or normal mean that reproduces P(over line) = p. */
function solveCenter(def: PropMarketDef, line: number, pOver: number): number {
  let lo = 0.01;
  let hi = Math.max(5, line * 4 + 5);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (overProb(def, mid, line) < pOver) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function shiftPropProb(def: PropMarketDef, pSide: number, side: Side, fromLine: number, toLine: number): number {
  if (fromLine === toLine) return pSide;
  const pOver = isPositive(side) ? pSide : 1 - pSide;
  let shifted: number;
  if (def.count) {
    const center = solveCenter(def, fromLine, clampProb(pOver, 0.01));
    shifted = overProb(def, center, toLine);
  } else {
    shifted = shiftProb(pOver, fromLine, toLine, propSd(def, fromLine));
  }
  return isPositive(side) ? shifted : 1 - shifted;
}

interface BookPlayerQuotes {
  book: string;
  outcomes: OddsApiOutcome[];
}

function groupByPlayer(books: OddsApiBookmaker[], market: string): Map<string, BookPlayerQuotes[]> {
  const out = new Map<string, BookPlayerQuotes[]>();
  for (const b of books) {
    const m = b.markets.find((x) => x.key === market);
    if (!m) continue;
    const perPlayer = new Map<string, OddsApiOutcome[]>();
    for (const o of m.outcomes) {
      if (!o.description) continue;
      const key = normalizePlayer(o.description);
      const list = perPlayer.get(key) ?? [];
      list.push(o);
      perPlayer.set(key, list);
    }
    for (const [player, outcomes] of perPlayer) {
      const list = out.get(player) ?? [];
      list.push({ book: b.key, outcomes });
      out.set(player, list);
    }
  }
  return out;
}

/** Fair probability of `side` at the given line for one book's quotes on one player. */
export function bookPropFair(
  def: PropMarketDef,
  quotes: OddsApiOutcome[],
  side: Side,
  line: number | null,
  method: AnalysisSettings["method"],
  sharp: boolean,
): { prob: number; adjusted: boolean; oneSided: boolean } | null {
  const opposite: Side = side === "over" ? "under" : side === "under" ? "over" : side === "yes" ? "no" : "yes";
  if (def.yesNo) {
    const mine = quotes.find((q) => sideOf(q.name) === side);
    const other = quotes.find((q) => sideOf(q.name) === opposite);
    if (mine && other) {
      const [p] = devig([1 / americanToDecimal(mine.price), 1 / americanToDecimal(other.price)], method);
      return Number.isFinite(p) ? { prob: p, adjusted: false, oneSided: false } : null;
    }
    // Only "Yes" posted: strip an assumed margin.
    const yes = quotes.find((q) => sideOf(q.name) === "yes");
    if (!yes) return null;
    const pYes = devigOneSided(1 / americanToDecimal(yes.price), sharp ? 0.05 : 0.08);
    return { prob: side === "yes" ? pYes : 1 - pYes, adjusted: false, oneSided: true };
  }
  if (line === null) return null;
  // Lines this book posts with both sides.
  const points = [...new Set(quotes.map((q) => q.point).filter((p): p is number => typeof p === "number"))];
  const usable = points
    .map((pt) => ({
      pt,
      over: quotes.find((q) => q.point === pt && sideOf(q.name) === "over"),
      under: quotes.find((q) => q.point === pt && sideOf(q.name) === "under"),
    }))
    .filter((x) => x.over && x.under)
    .sort((a, b) => Math.abs(a.pt - line) - Math.abs(b.pt - line));
  const pick = usable[0];
  if (!pick || !pick.over || !pick.under) return null;
  // Only move a line a short way: count stats by a step or two, continuous stats by half a spread.
  const maxGap = def.count ? Math.max(1.5, line * 0.2) : 0.5 * propSd(def, line);
  if (Math.abs(pick.pt - line) > maxGap) return null;
  const [pOver] = devig([1 / americanToDecimal(pick.over.price), 1 / americanToDecimal(pick.under.price)], method);
  if (!Number.isFinite(pOver)) return null;
  const pSide = side === "over" ? pOver : 1 - pOver;
  return { prob: shiftPropProb(def, pSide, side, pick.pt, line), adjusted: pick.pt !== line, oneSided: false };
}

export function statValues(def: PropMarketDef, log: GameLogEntry[]): number[] {
  const keys = def.espn ?? [];
  if (!keys.length) return [];
  return log
    .map((g) => {
      let sum = 0;
      let found = false;
      for (const k of keys) {
        const v = g.stats[k];
        if (typeof v === "number") {
          sum += v;
          found = true;
        }
      }
      return found ? sum : NaN;
    })
    .filter((v) => Number.isFinite(v));
}

export function buildPropStats(def: PropMarketDef, values: number[], dates: string[], line: number | null, side: Side, fairProb: number): PropStats | null {
  if (values.length < 3) return null;
  const threshold = def.yesNo ? 0.5 : (line ?? NaN);
  if (!Number.isFinite(threshold)) return null;
  const recent = values.slice(0, 15);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
  const l10 = values.slice(0, 10);
  const hits = (xs: number[]) => xs.filter((v) => v > threshold).length;
  // Recency weighted center: last 5 games count double.
  const weights = recent.map((_, i) => (i < 5 ? 2 : 1));
  const center = recent.reduce((s, v, i) => s + v * weights[i], 0) / weights.reduce((s, w) => s + w, 0);
  const pOverModel = overProb(def, center, threshold);
  const fairOver = isPositive(side) ? fairProb : 1 - fairProb;
  const shrunkRate = (hits(recent) + 4 * fairOver) / (recent.length + 4);
  const pOver = 0.5 * pOverModel + 0.5 * shrunkRate;
  return {
    sample: values.length,
    values: values.slice(0, 10),
    dates: dates.slice(0, 10),
    avg: avg(recent),
    l5Avg: values.length >= 5 ? avg(values.slice(0, 5)) : null,
    l10Avg: values.length >= 10 ? avg(l10) : null,
    hitsL10: hits(l10),
    gamesL10: l10.length,
    hitsSeason: hits(values),
    modelProb: clampProb(isPositive(side) ? pOver : 1 - pOver, 0.01),
  };
}

async function rosterMap(sport: SportConfig, homeId: string | null, awayId: string | null): Promise<Map<string, PlayerRef>> {
  const map = new Map<string, PlayerRef>();
  const teams: [string | null, "home" | "away"][] = [
    [homeId, "home"],
    [awayId, "away"],
  ];
  for (const [id, teamSide] of teams) {
    if (!id) continue;
    try {
      const roster = await getRoster(sport, id);
      for (const a of roster) {
        const full = normalizePlayer(a.name);
        map.set(full, { athlete: a, teamSide });
        const parts = full.split(" ");
        if (parts.length >= 2) {
          const short = `${parts[0][0]} ${parts[parts.length - 1]}`;
          if (!map.has(short)) map.set(short, { athlete: a, teamSide });
        }
      }
    } catch {
      // Rosters are optional; props still work without hit rates.
    }
  }
  return map;
}

function findPlayer(map: Map<string, PlayerRef>, name: string): PlayerRef | null {
  const n = normalizePlayer(name);
  if (map.has(n)) return map.get(n)!;
  const parts = n.split(" ");
  if (parts.length >= 2) {
    const short = `${parts[0][0]} ${parts[parts.length - 1]}`;
    if (map.has(short)) return map.get(short)!;
  }
  return null;
}

/** Demo mode seeds: real players from ESPN's team leaders with their real game logs. */
async function demoSeeds(sport: SportConfig, leaders: Record<string, { category: string; athleteId: string; name: string; position: string | null }[]>): Promise<DemoPropSeed[]> {
  const plan: { athleteId: string; name: string; markets: string[] }[] = [];
  const add = (athleteId: string, name: string, markets: string[]) => {
    const valid = markets.filter((m) => sport.props.some((p) => p.key === m));
    if (athleteId && valid.length) plan.push({ athleteId, name, markets: valid });
  };
  for (const list of Object.values(leaders)) {
    for (const l of list) {
      const c = l.category;
      if (sport.family === "football") {
        if (c === "passingYards") add(l.athleteId, l.name, ["player_pass_yds", "player_pass_tds"]);
        if (c === "rushingYards") add(l.athleteId, l.name, ["player_rush_yds", "player_anytime_td"]);
        if (c === "receivingYards") add(l.athleteId, l.name, ["player_reception_yds", "player_receptions", "player_anytime_td"]);
      } else if (sport.family === "basketball") {
        if (c.startsWith("points")) add(l.athleteId, l.name, ["player_points", "player_points_rebounds_assists", "player_threes"]);
        if (c.startsWith("rebounds")) add(l.athleteId, l.name, ["player_rebounds"]);
        if (c.startsWith("assists")) add(l.athleteId, l.name, ["player_assists"]);
      } else if (sport.family === "hockey") {
        if (c === "points") add(l.athleteId, l.name, ["player_points", "player_shots_on_goal"]);
        if (c === "goals") add(l.athleteId, l.name, ["player_goal_scorer_anytime", "player_shots_on_goal"]);
      }
    }
  }
  const logs = await mapLimitSettled(plan, 6, (p) => getGameLog(sport, p.athleteId));
  const seeds: DemoPropSeed[] = [];
  const seen = new Set<string>();
  plan.forEach((p, i) => {
    const log = logs[i];
    if (!log) return;
    for (const market of p.markets) {
      const key = `${p.name}|${market}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const def = sport.props.find((d) => d.key === market)!;
      const values = statValues(def, log);
      if (values.length >= 3) seeds.push({ player: p.name, market, values, yesNo: !!def.yesNo, count: !!def.count, cv: def.cv ?? null });
    }
  });
  return seeds;
}

export async function analyzeProps(
  sportKey: string,
  eventId: string,
  settings: AnalysisSettings,
  requested: string[] | null,
  force = false,
): Promise<PropsResponse> {
  const sport = getSport(sportKey);
  if (!sport) throw new Error(`Unknown sport ${sportKey}`);
  const mode = dataMode();
  const warnings: string[] = [];
  const markets = (requested?.length ? sport.props.filter((p) => requested.includes(p.key)) : sport.props).map((p) => p.key);

  const board = await getSportBoard(sport, settings, { focusEventId: eventId });
  const event = board.events.find((e) => e.id === eventId);
  const ctx = board.contexts.get(eventId);
  if (!event || !ctx) throw new Error("Game not found. It may have started or dropped off the board.");
  const summary = ctx.summary;
  const homeId = ctx.game?.home.id ?? summary?.homeId ?? null;
  const awayId = ctx.game?.away.id ?? summary?.awayId ?? null;

  let books: OddsApiBookmaker[] = [];
  if (mode === "live") {
    try {
      const { event: ev } = await getEventOdds(sport.key, eventId, markets, { force });
      books = ev.bookmakers ?? [];
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  } else if (summary) {
    const seeds = await demoSeeds(sport, summary.leaders);
    books = buildDemoProps(eventId, seeds, dayKey());
  }
  const fd = books.find((b) => b.key === TARGET_BOOK);
  if (!fd) {
    warnings.push(mode === "live" ? "FanDuel has no player props posted for this game yet." : "No demo props available for this game.");
    return { generatedAt: new Date().toISOString(), mode, eventId, sport: sport.key, legs: [], markets, usage: getUsage(), warnings };
  }

  const roster = await rosterMap(sport, homeId, awayId);

  // Collect the players FanDuel lists, then load their game logs.
  const fdPlayers = new Map<string, string>();
  for (const m of fd.markets) for (const o of m.outcomes) if (o.description) fdPlayers.set(normalizePlayer(o.description), o.description);
  const refs = [...fdPlayers.values()]
    .map((name) => ({ name, ref: findPlayer(roster, name) }))
    .filter((x) => x.ref)
    .slice(0, MAX_PLAYERS);
  const logs = await mapLimitSettled(refs, 6, (x) => getGameLog(sport, x.ref!.athlete.id));
  const logByPlayer = new Map<string, GameLogEntry[]>();
  refs.forEach((x, i) => {
    const log = logs[i];
    if (log) logByPlayer.set(normalizePlayer(x.name), log);
  });

  const others = books.filter((b) => b.key !== TARGET_BOOK);
  const legs: AnalyzedLeg[] = [];
  for (const fdMarket of fd.markets) {
    const def = sport.props.find((p) => p.key === fdMarket.key);
    if (!def) continue;
    const byPlayer = groupByPlayer(others, fdMarket.key);
    const fdByPlayer = groupByPlayer([fd], fdMarket.key);
    for (const outcome of fdMarket.outcomes) {
      const side = sideOf(outcome.name);
      if (!side || !outcome.description) continue;
      const playerKey = normalizePlayer(outcome.description);
      const point = def.yesNo ? null : (outcome.point ?? null);
      const fdDecimal = americanToDecimal(outcome.price);
      if (!Number.isFinite(fdDecimal)) continue;

      const inputs: BookProb[] = [];
      const quotes: Quote[] = [{ book: TARGET_BOOK, american: outcome.price, point }];
      let oneSided = false;
      for (const q of byPlayer.get(playerKey) ?? []) {
        const same = q.outcomes.find((o) => sideOf(o.name) === side && (def.yesNo || o.point === point));
        if (same) quotes.push({ book: q.book, american: same.price, point: same.point ?? null });
        const info = bookInfo(q.book);
        const fair = bookPropFair(def, q.outcomes, side, point, settings.method, info.sharp);
        if (!fair) continue;
        oneSided ||= fair.oneSided;
        inputs.push({ book: q.book, prob: fair.prob, weight: info.weight * (fair.oneSided ? 0.6 : 1), sharp: info.sharp, lineAdjusted: fair.adjusted });
      }
      const consensus = consensusProb(inputs);
      const fdQuotes = fdByPlayer.get(playerKey)?.[0]?.outcomes ?? [];
      const fdOwn = bookPropFair(def, fdQuotes, side, point, settings.method, false);
      const fairProb = consensus?.prob ?? (fdOwn ? fdOwn.prob : NaN);
      if (!Number.isFinite(fairProb)) continue;
      if (!consensus && fdOwn?.oneSided) oneSided = true;

      const ref = findPlayer(roster, outcome.description);
      const log = logByPlayer.get(playerKey) ?? [];
      const values = statValues(def, log);
      const dates = log.map((g) => g.date);
      const stats = buildPropStats(def, values, dates, point, side, fairProb);
      const infoWeightBase = stats ? (stats.sample >= 8 ? 0.2 : 0.12) : 0;
      const infoWeight = infoWeightBase * settings.infoWeight;
      // Props markets are softer than game lines, so the game log gets a little more room.
      const modelProb = blendCapped(fairProb, stats?.modelProb ?? null, infoWeight, MAX_INFO_SHIFT * 1.5 * settings.infoWeight);
      const ev = expectedValue(modelProb, fdDecimal);
      const marketEv = expectedValue(fairProb, fdDecimal);

      const fdPair = fdQuotes.filter((o) => def.yesNo || o.point === outcome.point);
      const fdHold = fdPair.length >= 2 ? hold(fdPair.map((o) => 1 / americanToDecimal(o.price))) : null;
      const best = quotes.reduce<Quote | null>((acc, q) => (!acc || americanToDecimal(q.american) > americanToDecimal(acc.american) ? q : acc), null);
      const signals: Signal[] = [...marketSignals(marketEv, consensus, fdHold, best, outcome.price)];
      if (oneSided) {
        signals.push({
          id: "one-sided",
          category: "market",
          label: "One-sided market",
          detail: "Only a Yes price is posted, so the fair price assumes a typical margin. Treat the edge as rough.",
          effect: -0.3,
          weight: 0,
        });
      }
      if (stats) {
        const lineText = def.yesNo ? "1+" : `${point}`;
        const sideWord = side === "under" || side === "no" ? "stayed under" : "cleared";
        const hitCount = side === "under" || side === "no" ? stats.gamesL10 - stats.hitsL10 : stats.hitsL10;
        signals.push({
          id: "hit-rate",
          category: "props",
          label: `${sideWord === "cleared" ? "Cleared" : "Stayed under"} ${lineText} in ${hitCount} of last ${stats.gamesL10}`,
          detail: `Average ${stats.avg.toFixed(1)} over the last ${Math.min(15, stats.sample)} games${stats.l5Avg !== null ? `, ${stats.l5Avg.toFixed(1)} over the last 5` : ""}. Game log model: ${((stats.modelProb ?? 0) * 100).toFixed(1)}% vs market ${(fairProb * 100).toFixed(1)}%.`,
          effect: clamp(((stats.modelProb ?? fairProb) - fairProb) / 0.08, -1, 1),
          weight: 8,
        });
      }
      const parsed = parseFanDuelLink(outcome.link);
      const sideWord = side === "over" ? "Over" : side === "under" ? "Under" : side === "yes" ? "" : "No";
      const label = def.yesNo
        ? `${outcome.description} ${sideWord ? `${sideWord} ` : ""}${def.label}`
        : `${outcome.description} ${sideWord} ${point} ${def.label}`;
      legs.push({
        id: `${eventId}|${fdMarket.key}|${playerKey}|${side}|${point ?? ""}`,
        eventId,
        espnId: ctx.game?.id ?? null,
        espnFlipped: !!ctx.espnFlipped,
        sport: sport.key,
        sportLabel: sport.short,
        home: event.home_team,
        away: event.away_team,
        homeAbbr: ctx.game?.home.abbr ?? null,
        awayAbbr: ctx.game?.away.abbr ?? null,
        commenceTime: event.commence_time,
        market: fdMarket.key,
        marketLabel: def.label,
        side,
        team: ref?.teamSide ?? null,
        player: outcome.description,
        point,
        label,
        fd: {
          american: outcome.price,
          decimal: fdDecimal,
          link: outcome.link ?? null,
          marketId: parsed?.marketId ?? null,
          selectionId: parsed?.selectionId ?? outcome.sid ?? null,
        },
        fairProb,
        infoProb: stats?.modelProb ?? null,
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
          oneSided,
          method: settings.method,
          source: consensus ? "consensus" : "fanduel-only",
        },
        best,
        quotes,
        confidence: Math.max(1, confidenceScore(marketEv, consensus, signals) - (oneSided ? 5 : 0)),
        signals,
        corr: {
          sport: sport.key,
          eventId,
          kind: "prop",
          teamSide: ref?.teamSide ?? null,
          direction: isPositive(side) ? 1 : -1,
          player: outcome.description,
          stat: def.stat,
        },
        propStats: stats,
        demo: mode === "demo",
      });
    }
  }
  legs.sort((a, b) => b.ev - a.ev);
  return { generatedAt: new Date().toISOString(), mode, eventId, sport: sport.key, legs, markets, usage: getUsage(), warnings };
}
