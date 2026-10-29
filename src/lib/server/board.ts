import "server-only";
import { TARGET_BOOK } from "../books";
import { getSport, SPORTS, type SportConfig } from "../sports";
import type { AnalysisSettings, AnalyzedLeg, BoardResponse, DataMode, GameView, SportStatus } from "../types";
import { analyzeGameLines } from "./analyze";
import { getConfig } from "./config";
import { buildDemoEvent } from "./demo";
import { flipGame, flipSummary, getStandings, getSummary, getUpcomingGames, type EspnGame, type EspnSummary, type SummaryTeamStanding } from "./espn";
import { mapLimitSettled } from "./http";
import { buildGameInfo, type GameContext } from "./info";
import { matchEvent } from "./match";
import { getOdds, getUsage, type OddsApiEvent } from "./oddsApi";
import { kickoffWeather, type KickoffWeather } from "./weather";

export function dataMode(): DataMode {
  return getConfig().oddsApiKey ? "live" : "demo";
}

export function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Summaries cost nothing but take time; only fetch them for games coming up soon. */
const SUMMARY_WINDOW_HOURS = 96;
const SUMMARY_CAP = 40;
const WEATHER_WINDOW_DAYS = 7;

export interface SportBoard {
  sport: SportConfig;
  mode: DataMode;
  events: OddsApiEvent[];
  games: GameView[];
  legs: AnalyzedLeg[];
  oddsStoredAt: number | null;
  error: string | null;
  contexts: Map<string, GameContext>;
}

function marketsFor(sport: SportConfig): string[] {
  return sport.hasDraw ? ["h2h", "totals"] : ["h2h", "spreads", "totals"];
}

async function loadEvents(sport: SportConfig, mode: DataMode, espnGames: EspnGame[], force: boolean) {
  if (mode === "live") {
    const { events, storedAt } = await getOdds(sport.key, marketsFor(sport), { force });
    return { events, storedAt };
  }
  const day = dayKey();
  // Only games with a real posted line, so simulated prices sit around something real.
  const priced = (g: EspnGame) => !!g.odds && (g.odds.mlHome !== null || g.odds.spreadHome !== null || g.odds.total !== null);
  const events = espnGames.filter((g) => g.state === "pre" && priced(g)).map((g) => buildDemoEvent(sport, g, day));
  return { events, storedAt: Date.now() };
}

export async function getSportBoard(
  sport: SportConfig,
  settings: AnalysisSettings,
  options: { force?: boolean; focusEventId?: string } = {},
): Promise<SportBoard> {
  const mode = dataMode();
  const contexts = new Map<string, GameContext>();
  let espnGames: EspnGame[] = [];
  try {
    espnGames = await getUpcomingGames(sport);
  } catch {
    espnGames = [];
  }

  let events: OddsApiEvent[] = [];
  let oddsStoredAt: number | null = null;
  let error: string | null = null;
  try {
    const loaded = await loadEvents(sport, mode, espnGames, !!options.force);
    events = loaded.events;
    oddsStoredAt = loaded.storedAt;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const now = Date.now();
  const horizon = now + (sport.weekly ? 9 : sport.espnDays + 1) * 86400000;
  events = events
    .filter((e) => {
      const t = Date.parse(e.commence_time);
      return t > now && t < horizon && e.bookmakers?.some((b) => b.key === TARGET_BOOK);
    })
    .sort((a, b) => a.commence_time.localeCompare(b.commence_time));

  // Pair each odds event with its ESPN game.
  const candidates = espnGames.map((g) => ({
    id: g.id,
    home: g.home.name,
    away: g.away.name,
    homeAliases: [g.home.shortName, `${g.home.location} ${g.home.nickname}`],
    awayAliases: [g.away.shortName, `${g.away.location} ${g.away.nickname}`],
    date: g.date,
    game: g,
  }));
  const pairs = events.map((e) => {
    const espnId = e.id.startsWith("demo-") ? e.id.slice(5) : null;
    if (espnId) return { event: e, game: espnGames.find((g) => g.id === espnId) ?? null, flipped: false };
    const m = matchEvent({ home: e.home_team, away: e.away_team, date: e.commence_time }, candidates);
    // Everything downstream assumes the odds feed's home team, so turn flipped ESPN games around.
    return { event: e, game: m ? (m.flipped ? flipGame(m.match.game) : m.match.game) : null, flipped: m?.flipped ?? false };
  });

  let standings: Record<string, SummaryTeamStanding> | null = null;
  try {
    standings = await getStandings(sport);
  } catch {
    standings = null;
  }

  const summaryTargets = pairs
    .filter((p) => p.game && (p.event.id === options.focusEventId || Date.parse(p.event.commence_time) < now + SUMMARY_WINDOW_HOURS * 3600000))
    .slice(0, SUMMARY_CAP);
  if (options.focusEventId) {
    const focus = pairs.find((p) => p.event.id === options.focusEventId);
    if (focus?.game && !summaryTargets.includes(focus)) summaryTargets.push(focus);
  }
  const summaries = new Map<string, EspnSummary>();
  const fetched = await mapLimitSettled(summaryTargets, 6, (p) => getSummary(sport, p.game!.id));
  summaryTargets.forEach((p, i) => {
    const s = fetched[i];
    if (s) summaries.set(p.game!.id, p.flipped ? flipSummary(s) : s);
  });

  const weather = new Map<string, KickoffWeather>();
  if (sport.outdoor) {
    const wxTargets = pairs.filter(
      (p) =>
        p.game &&
        p.game.venue.indoor !== true &&
        p.game.venue.city &&
        Date.parse(p.event.commence_time) < now + WEATHER_WINDOW_DAYS * 86400000,
    );
    const wx = await mapLimitSettled(wxTargets, 4, (p) => kickoffWeather(p.game!.venue.city!, p.game!.venue.state, p.event.commence_time));
    wxTargets.forEach((p, i) => {
      const w = wx[i];
      if (w) weather.set(p.game!.id, w);
    });
  }

  const games: GameView[] = [];
  const legs: AnalyzedLeg[] = [];
  for (const { event, game, flipped } of pairs) {
    const ctx: GameContext = {
      sport,
      game,
      summary: game ? (summaries.get(game.id) ?? null) : null,
      standings,
      weather: game ? (weather.get(game.id) ?? null) : null,
      espnFlipped: flipped,
    };
    contexts.set(event.id, ctx);
    const info = buildGameInfo(ctx);
    const eventLegs = analyzeGameLines({ sport, event, ctx, info, settings, demo: mode === "demo" });
    legs.push(...eventLegs);
    const fd = event.bookmakers?.find((b) => b.key === TARGET_BOOK);
    games.push({
      eventId: event.id,
      sport: sport.key,
      sportLabel: sport.short,
      commenceTime: event.commence_time,
      home: event.home_team,
      away: event.away_team,
      homeAbbr: game?.home.abbr ?? null,
      awayAbbr: game?.away.abbr ?? null,
      homeLogo: game?.home.logo ?? null,
      awayLogo: game?.away.logo ?? null,
      espnId: game?.id ?? null,
      fdEventLink: fd?.link ?? null,
      info,
      legIds: eventLegs.map((l) => l.id),
      bestEv: eventLegs.length ? Math.max(...eventLegs.map((l) => l.ev)) : null,
    });
  }

  return { sport, mode, events, games, legs, oddsStoredAt, error, contexts };
}

export async function buildBoard(sportKeys: string[], settings: AnalysisSettings, force = false): Promise<BoardResponse> {
  const sports = sportKeys.map((k) => getSport(k)).filter((s): s is SportConfig => !!s);
  const list = sports.length ? sports : SPORTS.slice(0, 4);
  const boards = await Promise.all(list.map((s) => getSportBoard(s, settings, { force })));
  const mode = dataMode();
  const warnings: string[] = [];
  const statuses: SportStatus[] = boards.map((b) => {
    if (b.error) warnings.push(`${b.sport.label}: ${b.error}`);
    return { key: b.sport.key, label: b.sport.label, games: b.games.length, error: b.error };
  });
  const stored = boards.map((b) => b.oddsStoredAt).filter((x): x is number => x !== null);
  const oldest = stored.length ? Math.min(...stored) : null;
  return {
    generatedAt: new Date().toISOString(),
    mode,
    oddsAgeSeconds: oldest !== null ? Math.round((Date.now() - oldest) / 1000) : null,
    sports: statuses,
    games: boards.flatMap((b) => b.games).sort((a, b) => a.commenceTime.localeCompare(b.commenceTime)),
    legs: boards.flatMap((b) => b.legs),
    usage: getUsage(),
    warnings,
  };
}

export function parseSettings(params: URLSearchParams): AnalysisSettings {
  const method = params.get("method");
  const infoWeight = params.has("infoWeight") ? Number(params.get("infoWeight")) : 1;
  return {
    method: method === "multiplicative" || method === "additive" || method === "shin" || method === "power" ? method : "power",
    infoWeight: Number.isFinite(infoWeight) && infoWeight >= 0 && infoWeight <= 3 ? infoWeight : 1,
  };
}
