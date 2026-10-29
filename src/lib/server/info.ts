import "server-only";
import { americanToProb, formatPoint } from "../odds/convert";
import { clamp, clampProb, mean, normCdf, normInv } from "../odds/stats";
import type { SportConfig } from "../sports";
import type { GameInfo, InjuryItem, LineMovement, Side, Signal, TeamInfo, WeatherInfo } from "../types";
import type { EspnGame, EspnSummary, SummaryTeamStanding } from "./espn";
import type { KickoffWeather } from "./weather";

// The "info" layer: everything we know about a game besides the odds. It does
// two jobs. It produces readable signals for the UI, and it produces a rough
// independent probability that gets blended (lightly) with the market price.

export interface GameContext {
  sport: SportConfig;
  game: EspnGame | null;
  summary: EspnSummary | null;
  standings: Record<string, SummaryTeamStanding> | null;
  weather: KickoffWeather | null;
  /** ESPN lists this game's teams the other way round; game and summary are already turned around. */
  espnFlipped?: boolean;
}

/** Games-played shrinkage: how many games before we trust a team's point differential. */
const SHRINK_GAMES: Record<string, number> = {
  americanfootball_nfl: 4,
  americanfootball_ncaaf: 5,
  basketball_nba: 10,
  basketball_ncaab: 8,
  icehockey_nhl: 12,
  baseball_mlb: 30,
};

function perGame(total: number | null, gp: number | null): number | null {
  return total !== null && gp !== null && gp > 0 ? total / gp : null;
}

function scoreParts(score: string): [number, number] | null {
  const m = /^(\d+)-(\d+)$/.exec(score.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function teamInfo(ctx: GameContext, which: "home" | "away"): TeamInfo {
  const g = ctx.game;
  const team = g ? g[which] : null;
  const id = team?.id ?? (which === "home" ? ctx.summary?.homeId : ctx.summary?.awayId) ?? null;
  const recent = (id && ctx.summary?.recent[id]) || [];
  const margins = recent.map((r) => r.margin).filter((m): m is number => m !== null);
  const parts = recent.map((r) => scoreParts(r.score)).filter((p): p is [number, number] => !!p);
  const standing = (id && (ctx.standings?.[id] ?? ctx.summary?.standings[id])) || null;
  let restDays: number | null = null;
  if (g && recent.length) {
    const start = Date.parse(g.date);
    const last = recent
      .map((r) => Date.parse(r.date))
      .filter((t) => Number.isFinite(t) && t < start - 3 * 3600000)
      .sort((a, b) => b - a)[0];
    if (last) restDays = Math.max(0, Math.round((start - last) / 86400000) - 1);
  }
  const leaders = (id && ctx.summary?.leaders[id]) || [];
  return {
    id,
    name: team?.name ?? "",
    abbr: team?.abbr ?? null,
    logo: team?.logo ?? null,
    record: team?.record ?? null,
    homeRecord: team?.homeRecord ?? null,
    awayRecord: team?.awayRecord ?? null,
    recent,
    last5Margin: margins.length ? mean(margins) : null,
    last5Points: parts.length ? mean(parts.map((p) => p[0])) : null,
    last5Allowed: parts.length ? mean(parts.map((p) => p[1])) : null,
    restDays,
    injuries: (id && ctx.summary?.injuries[id]) || [],
    pointsForPerGame: standing ? perGame(standing.pointsFor, standing.gamesPlayed) : null,
    pointsAgainstPerGame: standing ? perGame(standing.pointsAgainst, standing.gamesPlayed) : null,
    gamesPlayed: standing?.gamesPlayed ?? null,
    leaders: leaders.map((l) => ({ category: l.category, name: l.name, value: l.displayValue })),
  };
}

function weatherInfo(ctx: GameContext, indoor: boolean | null): WeatherInfo | null {
  if (indoor) return null;
  const espnW = ctx.game?.weather ?? null;
  const sumW = ctx.summary?.weather ?? null;
  const wx = ctx.weather;
  if (!espnW && !sumW && !wx) return null;
  return {
    tempF: wx?.tempF ?? espnW?.tempF ?? sumW?.tempF ?? null,
    windMph: wx?.windMph ?? null,
    gustMph: wx?.gustMph ?? null,
    precipPct: wx?.precipPct ?? sumW?.precipPct ?? null,
    summary: espnW?.summary ?? null,
    source: wx && (espnW || sumW) ? "both" : wx ? "open-meteo" : "espn",
  };
}

/** Points the weather takes off a football total (wind is the big one). */
function weatherTotalAdjustment(sport: SportConfig, w: WeatherInfo | null): number {
  if (!w || sport.family !== "football") return 0;
  let adj = 0;
  const wind = w.windMph ?? 0;
  if (wind >= 20) adj -= 3.5;
  else if (wind >= 15) adj -= 2;
  else if (wind >= 12) adj -= 0.75;
  if ((w.precipPct ?? 0) >= 60) adj -= 1.5;
  if (w.tempF !== null && w.tempF <= 25) adj -= 1;
  return adj;
}

function projectedMargin(ctx: GameContext, home: TeamInfo, away: TeamInfo): { margin: number | null; source: "predictor" | "stats" | "form" | null } {
  const sport = ctx.sport;
  const hfa = ctx.game?.neutralSite ? 0 : sport.homeAdv;
  const pred = ctx.summary?.predictor;
  if (pred && !sport.hasDraw) {
    const p = pred.home / (pred.home + pred.away);
    return { margin: sport.marginSd * normInv(clampProb(p, 0.01)), source: "predictor" };
  }
  if (home.pointsForPerGame !== null && home.pointsAgainstPerGame !== null && away.pointsForPerGame !== null && away.pointsAgainstPerGame !== null) {
    const gp = Math.min(home.gamesPlayed ?? 0, away.gamesPlayed ?? 0);
    if (gp >= 2) {
      const k = SHRINK_GAMES[sport.key] ?? 8;
      const netH = home.pointsForPerGame - home.pointsAgainstPerGame;
      const netA = away.pointsForPerGame - away.pointsAgainstPerGame;
      return { margin: hfa + (netH - netA) * (gp / (gp + k)), source: "stats" };
    }
  }
  if (home.last5Margin !== null && away.last5Margin !== null) {
    return { margin: hfa + (home.last5Margin - away.last5Margin) * 0.25, source: "form" };
  }
  return { margin: null, source: null };
}

function statTotal(ctx: GameContext, home: TeamInfo, away: TeamInfo): { total: number | null; source: "stats" | "form" | null; games: number } {
  if (home.pointsForPerGame !== null && home.pointsAgainstPerGame !== null && away.pointsForPerGame !== null && away.pointsAgainstPerGame !== null) {
    const gp = Math.min(home.gamesPlayed ?? 0, away.gamesPlayed ?? 0);
    if (gp >= 2) {
      const total = (home.pointsForPerGame + away.pointsAgainstPerGame) / 2 + (away.pointsForPerGame + home.pointsAgainstPerGame) / 2;
      return { total, source: "stats", games: gp };
    }
  }
  if (home.last5Points !== null && home.last5Allowed !== null && away.last5Points !== null && away.last5Allowed !== null) {
    const total = (home.last5Points + away.last5Allowed) / 2 + (away.last5Points + home.last5Allowed) / 2;
    return { total, source: "form", games: Math.min(home.recent.length, away.recent.length) };
  }
  return { total: null, source: null, games: 0 };
}

export function buildGameInfo(ctx: GameContext): GameInfo | null {
  const g = ctx.game;
  if (!g && !ctx.summary) return null;
  const home = teamInfo(ctx, "home");
  const away = teamInfo(ctx, "away");
  const indoor = g?.venue.indoor ?? ctx.summary?.venue.indoor ?? null;
  const weather = ctx.sport.outdoor ? weatherInfo(ctx, indoor) : null;
  const movement: LineMovement | null = g?.movement ?? ctx.summary?.movement ?? null;
  const { margin } = projectedMargin(ctx, home, away);
  const st = statTotal(ctx, home, away);
  const wxAdj = weatherTotalAdjustment(ctx.sport, weather);
  const notes: string[] = [];
  const h = home.abbr ?? home.name;
  const a = away.abbr ?? away.name;
  const pred = ctx.summary?.predictor;
  if (pred) notes.push(`ESPN matchup predictor: ${h} ${(pred.home * 100).toFixed(1)}%, ${a} ${(pred.away * 100).toFixed(1)}%.`);
  if (movement?.spreadOpen !== null && movement?.spreadNow !== null && movement && movement.spreadOpen !== movement.spreadNow) {
    notes.push(`Spread moved from ${h} ${formatPoint(movement.spreadOpen)} to ${formatPoint(movement.spreadNow)} since open (${movement.provider}).`);
  }
  if (movement?.totalOpen !== null && movement?.totalNow !== null && movement && movement.totalOpen !== movement.totalNow) {
    notes.push(`Total moved from ${movement.totalOpen} to ${movement.totalNow} since open.`);
  }
  for (const t of [home, away]) {
    const key = t.injuries.filter((i) => i.key);
    if (key.length) notes.push(`${t.abbr ?? t.name} key absences: ${key.map((i) => `${i.name} (${i.status})`).join(", ")}.`);
  }
  for (const t of [home, away]) {
    if (t.restDays === 0 && (ctx.sport.family === "basketball" || ctx.sport.family === "hockey")) {
      notes.push(`${t.abbr ?? t.name} is on the second night of a back-to-back.`);
    }
  }
  if (weather?.windMph !== null && weather?.windMph !== undefined && weather.windMph >= 15) {
    notes.push(`Wind around ${Math.round(weather.windMph)} mph at kickoff. Windy games tend to go under.`);
  }
  return {
    espnId: g?.id ?? ctx.summary?.espnId ?? "",
    venue: g?.venue.name ?? ctx.summary?.venue.name ?? null,
    city: [g?.venue.city ?? ctx.summary?.venue.city, g?.venue.state ?? ctx.summary?.venue.state].filter(Boolean).join(", ") || null,
    indoor,
    broadcast: g?.broadcast ?? null,
    weather,
    predictor: pred ?? null,
    movement,
    home,
    away,
    projectedMargin: margin,
    projectedTotal: st.total !== null ? st.total + wxAdj : null,
    notes,
  };
}

// ---------------- Per leg signals ----------------

export interface LegInfoInput {
  market: string;
  side: Side;
  point: number | null;
  fairProb: number;
}

export interface LegInfoResult {
  prob: number | null;
  weight: number;
  signals: Signal[];
}

function signal(id: string, category: Signal["category"], label: string, detail: string, effect: number, weight: number): Signal {
  return { id, category, label, detail, effect: clamp(effect, -1, 1), weight };
}

function movementScale(sport: SportConfig): { spread: number; total: number } {
  switch (sport.family) {
    case "football":
      return { spread: 1.5, total: 2 };
    case "basketball":
      return { spread: 2, total: 3 };
    default:
      return { spread: 0.5, total: 0.5 };
  }
}

function keyOut(list: InjuryItem[]): InjuryItem[] {
  return list.filter((i) => i.key);
}

export function legInfo(ctx: GameContext, info: GameInfo | null, leg: LegInfoInput): LegInfoResult {
  const signals: Signal[] = [];
  if (!info) return { prob: null, weight: 0, signals };
  const sport = ctx.sport;
  const isTeamMarket = leg.market === "h2h" || leg.market === "spreads";
  const teamSide: "home" | "away" | null = leg.side === "home" || leg.side === "away" ? leg.side : null;
  const own = teamSide ? info[teamSide] : null;
  const opp = teamSide ? info[teamSide === "home" ? "away" : "home"] : null;
  const ownName = own?.abbr ?? own?.name ?? "";
  const oppName = opp?.abbr ?? opp?.name ?? "";

  let prob: number | null = null;
  let weight = 0;
  const { margin, source } = projectedMargin(ctx, info.home, info.away);

  // Independent probability estimate.
  if (leg.market === "h2h" && teamSide && !sport.hasDraw) {
    const pred = ctx.summary?.predictor;
    if (pred) {
      const pHome = pred.home / (pred.home + pred.away);
      prob = teamSide === "home" ? pHome : 1 - pHome;
      weight = 0.15;
    } else if (margin !== null) {
      const pHome = normCdf(margin / sport.marginSd);
      prob = teamSide === "home" ? pHome : 1 - pHome;
      weight = source === "stats" ? 0.08 : 0.04;
    }
  } else if (leg.market === "spreads" && teamSide && leg.point !== null && margin !== null) {
    const m = teamSide === "home" ? margin : -margin;
    prob = normCdf((m + leg.point) / sport.marginSd);
    weight = source === "predictor" ? 0.12 : source === "stats" ? 0.08 : 0.04;
  } else if (leg.market === "totals" && leg.point !== null) {
    const st = statTotal(ctx, info.home, info.away);
    const wxAdj = weatherTotalAdjustment(sport, info.weather);
    if (st.total !== null) {
      // Regress the stat projection toward the posted line; early season stats are noisy.
      const k = SHRINK_GAMES[sport.key] ?? 8;
      const shrink = st.source === "stats" ? st.games / (st.games + k) : 0.25;
      const proj = leg.point + (st.total - leg.point) * shrink + wxAdj;
      const pOver = normCdf((proj - leg.point) / sport.totalSd);
      prob = leg.side === "over" ? pOver : 1 - pOver;
      weight = st.source === "stats" ? 0.1 : 0.05;
    } else if (wxAdj !== 0) {
      const pOver = normCdf(wxAdj / sport.totalSd);
      prob = leg.side === "over" ? pOver : 1 - pOver;
      weight = 0.06;
    }
  }

  if (prob !== null) {
    const diff = prob - leg.fairProb;
    const what =
      leg.market === "totals"
        ? `stat model projects about ${info.projectedTotal !== null ? info.projectedTotal.toFixed(1) : "?"} total`
        : ctx.summary?.predictor
          ? "ESPN matchup predictor"
          : "point differential model";
    signals.push(
      signal(
        "model",
        "model",
        Math.abs(diff) < 0.01 ? "Model agrees with market" : diff > 0 ? "Model likes this side" : "Model leans the other way",
        `${what}: ${(prob * 100).toFixed(1)}% vs market ${(leg.fairProb * 100).toFixed(1)}%.`,
        diff / 0.06,
        8,
      ),
    );
  }

  // Line movement since open (from ESPN's DraftKings feed).
  const mv = info.movement;
  if (mv) {
    const scale = movementScale(sport);
    if (leg.market === "h2h" && teamSide && mv.mlHomeOpen !== null && mv.mlHomeNow !== null) {
      const delta = americanToProb(mv.mlHomeNow) - americanToProb(mv.mlHomeOpen);
      const dir = teamSide === "home" ? delta : -delta;
      if (Math.abs(delta) >= 0.015) {
        signals.push(
          signal(
            "movement",
            "movement",
            dir > 0 ? "Money coming in on this side" : "Line moving against this side",
            `${info.home.abbr ?? "Home"} moneyline moved ${mv.mlHomeOpen > 0 ? "+" : ""}${mv.mlHomeOpen} to ${mv.mlHomeNow > 0 ? "+" : ""}${mv.mlHomeNow} since open.`,
            dir / 0.04,
            5,
          ),
        );
      }
    } else if (leg.market === "spreads" && teamSide && mv.spreadOpen !== null && mv.spreadNow !== null && mv.spreadOpen !== mv.spreadNow) {
      const delta = mv.spreadNow - mv.spreadOpen; // negative = home more favored
      const dir = teamSide === "home" ? -delta : delta;
      signals.push(
        signal(
          "movement",
          "movement",
          dir > 0 ? "Spread moving toward this side" : "Spread moving against this side",
          `${info.home.abbr ?? "Home"} went from ${formatPoint(mv.spreadOpen)} to ${formatPoint(mv.spreadNow)}.`,
          dir / scale.spread,
          5,
        ),
      );
    } else if (leg.market === "totals" && mv.totalOpen !== null && mv.totalNow !== null && mv.totalOpen !== mv.totalNow) {
      const delta = mv.totalNow - mv.totalOpen;
      const dir = leg.side === "over" ? delta : -delta;
      signals.push(
        signal(
          "movement",
          "movement",
          dir > 0 ? "Total moving this way" : "Total moving the other way",
          `Total went from ${mv.totalOpen} to ${mv.totalNow} since open.`,
          dir / scale.total,
          5,
        ),
      );
    }
  }

  // Injuries.
  if (isTeamMarket && own && opp) {
    const ownKey = keyOut(own.injuries);
    const oppKey = keyOut(opp.injuries);
    if (ownKey.length || oppKey.length) {
      const effect = (oppKey.length - ownKey.length) * 0.5;
      const parts = [];
      if (ownKey.length) parts.push(`${ownName} missing ${ownKey.map((i) => i.name).join(", ")}`);
      if (oppKey.length) parts.push(`${oppName} missing ${oppKey.map((i) => i.name).join(", ")}`);
      signals.push(signal("injuries", "injury", effect > 0 ? "Opponent is shorthanded" : effect < 0 ? "Key players out" : "Key absences on both sides", `${parts.join("; ")}. Usually priced in once announced.`, effect, 4));
    }
  } else if (leg.market === "totals") {
    const keyTotal = keyOut(info.home.injuries).length + keyOut(info.away.injuries).length;
    if (keyTotal > 0) {
      signals.push(
        signal("injuries", "injury", "Key players out", `${keyTotal} key player${keyTotal > 1 ? "s" : ""} out between both teams, a small lean toward the under.`, (leg.side === "under" ? 1 : -1) * 0.3 * keyTotal, 3),
      );
    }
  }

  // Recent form.
  if (isTeamMarket && own && opp && own.last5Margin !== null && opp.last5Margin !== null) {
    const diff = own.last5Margin - opp.last5Margin;
    const recW = (t: TeamInfo) => t.recent.filter((r) => r.result === "W").length;
    signals.push(
      signal(
        "form",
        "form",
        diff > 0 ? "Better recent form" : "Worse recent form",
        `Last 5: ${ownName} ${recW(own)}-${own.recent.length - recW(own)} (${own.last5Margin > 0 ? "+" : ""}${own.last5Margin.toFixed(1)} avg margin) vs ${oppName} ${recW(opp)}-${opp.recent.length - recW(opp)} (${opp.last5Margin > 0 ? "+" : ""}${opp.last5Margin.toFixed(1)}).`,
        (diff / sport.marginSd) * 0.6,
        3,
      ),
    );
  }

  // Rest.
  if (isTeamMarket && own && opp && own.restDays !== null && opp.restDays !== null && own.restDays !== opp.restDays) {
    // Back-to-backs matter in the NBA/NHL; in football it is short weeks and byes.
    const b2b = sport.family === "basketball" || sport.family === "hockey";
    const cap = b2b ? 3 : 13;
    const diff = Math.min(cap, own.restDays) - Math.min(cap, opp.restDays);
    if (Math.abs(diff) >= (b2b ? 1 : 3)) {
      signals.push(
        signal(
          "rest",
          "rest",
          diff > 0 ? "Rest advantage" : "Rest disadvantage",
          `${ownName} ${own.restDays} day${own.restDays === 1 ? "" : "s"} rest vs ${oppName} ${opp.restDays}.`,
          diff * (b2b ? 0.5 : 0.12),
          3,
        ),
      );
    }
  }

  // Weather for totals.
  if (leg.market === "totals" && info.weather && (sport.family === "football" || sport.family === "baseball")) {
    const w = info.weather;
    const wind = w.windMph ?? 0;
    const rain = w.precipPct ?? 0;
    if (wind >= 12 || rain >= 60) {
      const strength = sport.family === "football" ? (wind >= 20 ? 1 : wind >= 15 ? 0.7 : 0.3) + (rain >= 60 ? 0.3 : 0) : 0.3;
      signals.push(
        signal(
          "weather",
          "weather",
          "Weather favors the under",
          `${wind ? `${Math.round(wind)} mph wind` : ""}${wind && rain >= 60 ? ", " : ""}${rain >= 60 ? `${rain}% chance of rain` : ""} at game time.`,
          (leg.side === "under" ? 1 : -1) * strength,
          6,
        ),
      );
    }
  }

  return { prob, weight, signals };
}
