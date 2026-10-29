import "server-only";
import type { SportConfig } from "../sports";
import type { InjuryItem, LineMovement, RecentGame } from "../types";
import { cached, type CacheOptions } from "./cache";
import { fetchJson } from "./http";

// ESPN's public site API. Undocumented but free and stable enough; every field
// is read defensively because shapes vary by sport.

const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const SITE_V2 = "https://site.api.espn.com/apis/v2/sports";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports";

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "even" || s === "ev") return 100;
    if (s === "pk" || s === "pick") return 0;
    const n = Number(s.replace(/^[ou]/, "").replace(/[^0-9.+-]/g, ""));
    return s.length && Number.isFinite(n) ? n : null;
  }
  return null;
};

export interface EspnTeam {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  location: string;
  nickname: string;
  logo: string | null;
  score: number | null;
  record: string | null;
  homeRecord: string | null;
  awayRecord: string | null;
}

export interface EspnGame {
  id: string;
  date: string;
  name: string;
  state: "pre" | "in" | "post";
  statusDetail: string;
  completed: boolean;
  neutralSite: boolean;
  home: EspnTeam;
  away: EspnTeam;
  venue: { name: string | null; city: string | null; state: string | null; indoor: boolean | null };
  weather: { tempF: number | null; summary: string | null } | null;
  broadcast: string | null;
  odds: {
    provider: string;
    spreadHome: number | null;
    total: number | null;
    mlHome: number | null;
    mlAway: number | null;
    spreadHomeOdds: number | null;
    spreadAwayOdds: number | null;
    overOdds: number | null;
    underOdds: number | null;
    drawOdds: number | null;
  } | null;
  movement: LineMovement | null;
}

function parseTeam(c: Json): EspnTeam {
  const team = obj(c.team);
  const records = arr(c.records).map(obj);
  const rec = (types: string[]) => {
    const r = records.find((x) => types.includes(String(x.type ?? x.name ?? "").toLowerCase()));
    return r ? str(r.summary) : null;
  };
  return {
    id: str(team.id) ?? str(c.id) ?? "",
    name: str(team.displayName) ?? str(team.name) ?? "",
    shortName: str(team.shortDisplayName) ?? str(team.name) ?? "",
    abbr: str(team.abbreviation) ?? "",
    location: str(team.location) ?? "",
    nickname: str(team.name) ?? "",
    logo: str(team.logo) ?? str(obj(arr(team.logos)[0]).href),
    score: num(c.score),
    record: rec(["total", "overall", "ytd"]),
    homeRecord: rec(["home"]),
    awayRecord: rec(["road", "away"]),
  };
}

function parseMovement(o: Json): LineMovement | null {
  const ml = obj(o.moneyline);
  const ps = obj(o.pointSpread);
  const tot = obj(o.total);
  const g2 = (side: unknown, phase: "open" | "close", field: "odds" | "line") => num(obj(obj(side)[phase])[field]);
  const m: LineMovement = {
    provider: str(obj(o.provider).name) ?? "ESPN",
    spreadOpen: g2(ps.home, "open", "line"),
    spreadNow: g2(ps.home, "close", "line"),
    totalOpen: g2(tot.over, "open", "line"),
    totalNow: g2(tot.over, "close", "line"),
    mlHomeOpen: g2(ml.home, "open", "odds"),
    mlHomeNow: g2(ml.home, "close", "odds"),
    mlAwayOpen: g2(ml.away, "open", "odds"),
    mlAwayNow: g2(ml.away, "close", "odds"),
  };
  const any = Object.entries(m).some(([k, v]) => k !== "provider" && v !== null);
  return any ? m : null;
}

function parseOdds(o: Json): EspnGame["odds"] {
  const ml = obj(o.moneyline);
  const ps = obj(o.pointSpread);
  const tot = obj(o.total);
  const close = (side: unknown, field: "odds" | "line") => num(obj(obj(side).close)[field]);
  const home = obj(o.homeTeamOdds);
  const away = obj(o.awayTeamOdds);
  const drawOdds = num(obj(o.drawOdds).moneyLine) ?? close(ml.draw, "odds");
  return {
    provider: str(obj(o.provider).name) ?? "ESPN",
    spreadHome: close(ps.home, "line") ?? num(o.spread),
    total: close(tot.over, "line") ?? num(o.overUnder),
    mlHome: close(ml.home, "odds") ?? num(home.moneyLine),
    mlAway: close(ml.away, "odds") ?? num(away.moneyLine),
    spreadHomeOdds: close(ps.home, "odds") ?? num(home.spreadOdds),
    spreadAwayOdds: close(ps.away, "odds") ?? num(away.spreadOdds),
    overOdds: close(tot.over, "odds") ?? num(o.overOdds),
    underOdds: close(tot.under, "odds") ?? num(o.underOdds),
    drawOdds,
  };
}

function parseEvent(e: Json): EspnGame | null {
  const comp = obj(arr(e.competitions)[0]);
  const competitors = arr(comp.competitors).map(obj);
  const homeC = competitors.find((c) => c.homeAway === "home");
  const awayC = competitors.find((c) => c.homeAway === "away");
  if (!homeC || !awayC) return null;
  const status = obj(obj(comp.status).type);
  const venue = obj(comp.venue);
  const addr = obj(venue.address);
  const weather = obj(e.weather);
  const oddsList = arr(comp.odds).map(obj);
  const odds = oddsList[0];
  const broadcasts = arr(comp.broadcasts)
    .flatMap((b) => arr(obj(b).names))
    .map(str)
    .filter(Boolean) as string[];
  const state = str(status.state);
  return {
    id: str(e.id) ?? "",
    date: str(e.date) ?? str(comp.date) ?? "",
    name: str(e.name) ?? "",
    state: state === "in" || state === "post" ? state : "pre",
    statusDetail: str(status.shortDetail) ?? str(status.detail) ?? "",
    completed: status.completed === true,
    neutralSite: comp.neutralSite === true,
    home: parseTeam(homeC),
    away: parseTeam(awayC),
    venue: {
      name: str(venue.fullName),
      city: str(addr.city),
      state: str(addr.state),
      indoor: typeof venue.indoor === "boolean" ? venue.indoor : null,
    },
    weather: Object.keys(weather).length ? { tempF: num(weather.temperature), summary: str(weather.displayValue) } : null,
    broadcast: broadcasts[0] ?? null,
    odds: odds ? parseOdds(odds) : null,
    movement: odds ? parseMovement(odds) : null,
  };
}

function easternDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

interface ScoreboardPage {
  games: EspnGame[];
  week: number | null;
  seasonType: number | null;
}

async function scoreboardPage(sport: SportConfig, extra: Record<string, string> = {}): Promise<ScoreboardPage> {
  const { sport: s, league } = sport.espn;
  const qs = new URLSearchParams({ limit: "300", ...extra });
  if (sport.key === "americanfootball_ncaaf") qs.set("groups", "80");
  if (sport.key === "basketball_ncaab") qs.set("groups", "50");
  const url = `${SITE}/${s}/${league}/scoreboard?${qs.toString()}`;
  const res = await cached(`espn:sb:${url}`, 5 * 60 * 1000, async () => {
    const { data } = await fetchJson<Json>(url);
    return {
      games: arr(data.events)
        .map((e) => parseEvent(obj(e)))
        .filter((x): x is EspnGame => !!x && !!x.id),
      week: num(obj(data.week).number),
      seasonType: num(obj(data.season).type),
    };
  });
  return res.value;
}

async function scoreboard(sport: SportConfig, dates?: string): Promise<EspnGame[]> {
  return (await scoreboardPage(sport, dates ? { dates } : {})).games;
}

/** Upcoming games: the current and next week for football, the next few days otherwise. */
export async function getUpcomingGames(sport: SportConfig): Promise<EspnGame[]> {
  let lists: EspnGame[][];
  if (sport.weekly) {
    const current = await scoreboardPage(sport);
    lists = [current.games];
    // Early in the week ESPN still shows the finished week, so look one week ahead too.
    if (current.week !== null && current.seasonType !== null) {
      const next = await scoreboardPage(sport, { week: String(current.week + 1), seasontype: String(current.seasonType) }).catch(() => null);
      if (next) lists.push(next.games);
    }
  } else {
    const now = Date.now();
    const days = Array.from({ length: sport.espnDays }, (_, i) => easternDate(new Date(now + i * 86400000)));
    lists = await Promise.all(days.map((d) => scoreboard(sport, d).catch(() => [] as EspnGame[])));
  }
  const seen = new Map<string, EspnGame>();
  for (const g of lists.flat()) seen.set(g.id, g);
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getGamesOnDate(sport: SportConfig, date: Date): Promise<EspnGame[]> {
  return scoreboard(sport, easternDate(date));
}

// ---------- Game summary ----------

export interface SummaryTeamStanding {
  teamId: string;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  gamesPlayed: number | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
}

function gamesPlayed(stats: Json[], wins: number | null, losses: number | null, ties: number | null): number | null {
  const gp = num(stats.find((x) => x.name === "gamesPlayed")?.value);
  if (gp !== null && gp > 0) return gp;
  const overall = stats.find((x) => x.name === "overall" || x.type === "total");
  const summary = overall ? (str(overall.summary) ?? str(overall.displayValue)) : null;
  if (summary && /^\d+(-\d+)+$/.test(summary)) return summary.split("-").reduce((s, x) => s + Number(x), 0);
  if (wins === null && losses === null) return null;
  return (wins ?? 0) + (losses ?? 0) + (ties ?? 0);
}

export interface SummaryLeader {
  category: string;
  athleteId: string;
  name: string;
  value: number | null;
  displayValue: string;
  position: string | null;
}

export interface EspnSummary {
  espnId: string;
  homeId: string;
  awayId: string;
  state: "pre" | "in" | "post";
  completed: boolean;
  statusDetail: string;
  homeScore: number | null;
  awayScore: number | null;
  predictor: { home: number; away: number; tie: number | null } | null;
  injuries: Record<string, InjuryItem[]>;
  recent: Record<string, RecentGame[]>;
  standings: Record<string, SummaryTeamStanding>;
  leaders: Record<string, SummaryLeader[]>;
  weather: { tempF: number | null; precipPct: number | null } | null;
  venue: { name: string | null; city: string | null; state: string | null; indoor: boolean | null };
  movement: LineMovement | null;
}

const KEY_POSITIONS: Record<string, string[]> = {
  football: ["QB"],
  hockey: ["G"],
  baseball: ["SP"],
};

function parseInjuries(list: unknown[], family: string, leaderIds: Set<string>): InjuryItem[] {
  return list
    .map(obj)
    .map((i) => {
      const athlete = obj(i.athlete);
      const position = str(obj(athlete.position).abbreviation);
      const status = str(i.status) ?? str(obj(i.type).description) ?? "Unknown";
      const details = obj(i.details);
      const id = str(athlete.id) ?? "";
      const out = /\b(out|doubtful|suspension|suspended|injured reserve|ir)\b/i.test(status);
      const keyPos = (KEY_POSITIONS[family] ?? []).includes(position ?? "");
      return {
        name: str(athlete.displayName) ?? str(athlete.fullName) ?? "Unknown",
        position,
        status,
        detail: [str(details.type), str(details.detail)].filter((x) => x && x !== "Not Specified").join(" - ") || null,
        date: str(i.date),
        key: out && (keyPos || leaderIds.has(id)),
      };
    });
}

function parseRecent(teamId: string, events: unknown[]): RecentGame[] {
  return events.map(obj).map((ev) => {
    const homeId = str(ev.homeTeamId);
    const hs = num(ev.homeTeamScore);
    const as = num(ev.awayTeamScore);
    const isHome = homeId === teamId;
    const margin = hs !== null && as !== null ? (isHome ? hs - as : as - hs) : null;
    const own = isHome ? hs : as;
    const opp = isHome ? as : hs;
    return {
      date: str(ev.gameDate) ?? "",
      result: str(ev.gameResult) ?? "",
      score: own !== null && opp !== null ? `${own}-${opp}` : (str(ev.score) ?? ""),
      margin,
      opponent: str(obj(ev.opponent).abbreviation) ?? str(obj(ev.opponent).displayName),
      atVs: str(ev.atVs),
    };
  });
}

export async function getSummary(sport: SportConfig, espnId: string, options: CacheOptions = {}): Promise<EspnSummary> {
  const { sport: s, league } = sport.espn;
  const url = `${SITE}/${s}/${league}/summary?event=${encodeURIComponent(espnId)}`;
  const res = await cached(`espn:summary:${url}`, 10 * 60 * 1000, async () => {
    const { data } = await fetchJson<Json>(url);
    const header = obj(data.header);
    const comp = obj(arr(header.competitions)[0]);
    const competitors = arr(comp.competitors).map(obj);
    const homeC = competitors.find((c) => c.homeAway === "home");
    const awayC = competitors.find((c) => c.homeAway === "away");
    const homeId = str(homeC?.id) ?? "";
    const awayId = str(awayC?.id) ?? "";
    const statusType = obj(obj(comp.status).type);
    const state = str(statusType.state);

    const pred = obj(data.predictor);
    const ph = num(obj(pred.homeTeam).gameProjection);
    const pa = num(obj(pred.awayTeam).gameProjection);
    const predictor =
      ph !== null && pa !== null && ph + pa > 0
        ? { home: ph / 100, away: pa / 100, tie: ph + pa < 99.5 ? Math.max(0, 1 - (ph + pa) / 100) : null }
        : null;

    const leaders: Record<string, SummaryLeader[]> = {};
    for (const t of arr(data.leaders).map(obj)) {
      const teamId = str(obj(t.team).id) ?? "";
      leaders[teamId] = arr(t.leaders)
        .map(obj)
        .flatMap((cat) =>
          arr(cat.leaders)
            .slice(0, 1)
            .map(obj)
            .map((l) => {
              const athlete = obj(l.athlete);
              return {
                category: str(cat.name) ?? "",
                athleteId: str(athlete.id) ?? "",
                name: str(athlete.displayName) ?? str(athlete.fullName) ?? "",
                value: num(l.value),
                displayValue: str(l.displayValue) ?? "",
                position: str(obj(athlete.position).abbreviation),
              };
            }),
        );
    }
    const leaderIds = new Set(Object.values(leaders).flat().map((l) => l.athleteId));

    const injuries: Record<string, InjuryItem[]> = {};
    for (const t of arr(data.injuries).map(obj)) {
      const teamId = str(obj(t.team).id) ?? "";
      injuries[teamId] = parseInjuries(arr(t.injuries), sport.family, leaderIds);
    }

    const recent: Record<string, RecentGame[]> = {};
    for (const t of arr(data.lastFiveGames).map(obj)) {
      const teamId = str(obj(t.team).id) ?? "";
      recent[teamId] = parseRecent(teamId, arr(t.events));
    }

    const standings: Record<string, SummaryTeamStanding> = {};
    for (const group of arr(obj(data.standings).groups).map(obj)) {
      for (const entry of arr(obj(group.standings).entries).map(obj)) {
        const stats = arr(entry.stats).map(obj);
        const stat = (name: string) => num(stats.find((x) => x.name === name || x.type === name)?.value);
        const teamId = str(entry.id) ?? "";
        const wins = stat("wins");
        const losses = stat("losses");
        const ties = stat("ties");
        standings[teamId] = {
          teamId,
          wins,
          losses,
          ties,
          gamesPlayed: gamesPlayed(stats, wins, losses, ties),
          pointsFor: stat("pointsFor"),
          pointsAgainst: stat("pointsAgainst"),
        };
      }
    }

    const gameInfo = obj(data.gameInfo);
    const venue = obj(gameInfo.venue);
    const addr = obj(venue.address);
    const weather = obj(gameInfo.weather);
    const pick = obj(arr(data.pickcenter)[0]);

    const summary: EspnSummary = {
      espnId,
      homeId,
      awayId,
      state: state === "in" || state === "post" ? state : "pre",
      completed: statusType.completed === true,
      statusDetail: str(statusType.shortDetail) ?? str(statusType.detail) ?? "",
      homeScore: num(homeC?.score),
      awayScore: num(awayC?.score),
      predictor,
      injuries,
      recent,
      standings,
      leaders,
      weather: Object.keys(weather).length ? { tempF: num(weather.temperature), precipPct: num(weather.precipitation) } : null,
      venue: {
        name: str(venue.fullName),
        city: str(addr.city),
        state: str(addr.state),
        indoor: typeof venue.indoor === "boolean" ? venue.indoor : null,
      },
      movement: Object.keys(pick).length ? parseMovement(pick) : null,
    };
    return summary;
  }, options);
  return res.value;
}

// ---------- Rosters and game logs (player props) ----------

export interface EspnAthlete {
  id: string;
  name: string;
  position: string | null;
  teamId: string;
}

export async function getRoster(sport: SportConfig, teamId: string): Promise<EspnAthlete[]> {
  const { sport: s, league } = sport.espn;
  const url = `${SITE}/${s}/${league}/teams/${encodeURIComponent(teamId)}/roster`;
  const res = await cached(`espn:roster:${url}`, 6 * 60 * 60 * 1000, async () => {
    const { data } = await fetchJson<Json>(url);
    const raw = arr(data.athletes).map(obj);
    // Some sports group athletes by position ({position, items}), others are flat.
    const flat = raw.flatMap((a) => (Array.isArray(a.items) ? arr(a.items).map(obj) : [a]));
    return flat
      .map((a) => ({
        id: str(a.id) ?? "",
        name: str(a.fullName) ?? str(a.displayName) ?? "",
        position: str(obj(a.position).abbreviation),
        teamId,
      }))
      .filter((a) => a.id && a.name);
  });
  return res.value;
}

export interface GameLogEntry {
  eventId: string;
  date: string;
  stats: Record<string, number>;
}

export async function getGameLog(sport: SportConfig, athleteId: string): Promise<GameLogEntry[]> {
  const { sport: s, league } = sport.espn;
  const url = `${WEB}/${s}/${league}/athletes/${encodeURIComponent(athleteId)}/gamelog`;
  const res = await cached(`espn:gamelog:${url}`, 2 * 60 * 60 * 1000, async () => {
    const { data } = await fetchJson<Json>(url);
    const names = arr(data.names).map((n) => str(n) ?? "");
    const eventsMeta = obj(data.events);
    const entries = new Map<string, GameLogEntry>();
    for (const st of arr(data.seasonTypes).map(obj)) {
      const label = (str(st.displayName) ?? "").toLowerCase();
      if (label.includes("preseason") || label.includes("spring")) continue;
      for (const cat of arr(st.categories).map(obj)) {
        if (str(cat.type) && str(cat.type) !== "event") continue;
        for (const ev of arr(cat.events).map(obj)) {
          const eventId = str(ev.eventId) ?? "";
          if (!eventId || entries.has(eventId)) continue;
          const values = arr(ev.stats).map((v) => str(v) ?? "");
          const stats: Record<string, number> = {};
          names.forEach((name, i) => {
            const raw = values[i] ?? "";
            if (name.includes("-") && raw.includes("-")) {
              // Combined columns like "threePointFieldGoalsMade-threePointFieldGoalsAttempted" = "3-7".
              const [made, att] = raw.split("-").map(Number);
              const [nMade, nAtt] = name.split("-");
              if (Number.isFinite(made)) stats[nMade] = made;
              if (Number.isFinite(att)) stats[nAtt] = att;
            } else {
              const n = Number(raw.replace(/,/g, ""));
              if (raw !== "" && Number.isFinite(n)) stats[name] = n;
            }
          });
          if (stats.totalBases === undefined && stats.hits !== undefined) {
            stats.totalBases = stats.hits + (stats.doubles ?? 0) + 2 * (stats.triples ?? 0) + 3 * (stats.homeRuns ?? 0);
          }
          const meta = obj(eventsMeta[eventId]);
          entries.set(eventId, { eventId, date: str(meta.gameDate) ?? "", stats });
        }
      }
    }
    return [...entries.values()].sort((a, b) => b.date.localeCompare(a.date));
  });
  return res.value;
}

/** Full league standings for point differentials when the summary lacks them. */
export async function getStandings(sport: SportConfig): Promise<Record<string, SummaryTeamStanding>> {
  const { sport: s, league } = sport.espn;
  const url = `${SITE_V2}/${s}/${league}/standings`;
  const res = await cached(`espn:standings:${url}`, 60 * 60 * 1000, async () => {
    const { data } = await fetchJson<Json>(url);
    const out: Record<string, SummaryTeamStanding> = {};
    const walk = (node: Json) => {
      for (const entry of arr(obj(node.standings).entries).map(obj)) {
        const team = obj(entry.team);
        const stats = arr(entry.stats).map(obj);
        const stat = (...keys: string[]) => num(stats.find((x) => keys.includes(String(x.name)) || keys.includes(String(x.type)))?.value);
        const teamId = str(team.id) ?? "";
        if (!teamId) continue;
        const wins = stat("wins");
        const losses = stat("losses");
        const ties = stat("ties", "otLosses", "overtimeLosses");
        out[teamId] = {
          teamId,
          wins,
          losses,
          ties,
          gamesPlayed: gamesPlayed(stats, wins, losses, ties),
          pointsFor: stat("pointsFor"),
          pointsAgainst: stat("pointsAgainst"),
        };
      }
      for (const child of arr(node.children).map(obj)) walk(child);
    };
    walk(data);
    return out;
  });
  return res.value;
}
