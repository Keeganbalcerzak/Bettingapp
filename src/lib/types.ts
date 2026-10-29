import type { CorrDescriptor } from "./odds/correlation";
import type { DevigMethod } from "./odds/devig";

export type Side = "home" | "away" | "draw" | "over" | "under" | "yes" | "no";
export type DataMode = "live" | "demo";

export interface Quote {
  book: string;
  american: number;
  point?: number | null;
}

export type SignalCategory = "market" | "model" | "injury" | "form" | "rest" | "weather" | "movement" | "props" | "price";

export interface Signal {
  id: string;
  category: SignalCategory;
  label: string;
  detail: string;
  /** -1..1 from the point of view of this bet. Positive supports it. */
  effect: number;
  /** How many confidence points a full-strength signal is worth. */
  weight: number;
}

export interface PropStats {
  sample: number;
  values: number[];
  dates: string[];
  avg: number;
  l5Avg: number | null;
  l10Avg: number | null;
  hitsL10: number;
  gamesL10: number;
  hitsSeason: number;
  /** Probability from the player's game log, before blending. */
  modelProb: number | null;
}

export interface AnalyzedLeg {
  id: string;
  eventId: string;
  espnId?: string | null;
  /** ESPN lists home and away the other way round, so ESPN scores must be swapped to grade. */
  espnFlipped?: boolean;
  sport: string;
  sportLabel: string;
  home: string;
  away: string;
  homeAbbr?: string | null;
  awayAbbr?: string | null;
  commenceTime: string;
  market: string;
  marketLabel: string;
  side: Side;
  team?: "home" | "away" | null;
  player?: string | null;
  point?: number | null;
  label: string;
  fd: {
    american: number;
    decimal: number;
    link?: string | null;
    marketId?: string | null;
    selectionId?: string | null;
  };
  fairProb: number;
  infoProb: number | null;
  infoWeight: number;
  modelProb: number;
  ev: number;
  marketEv: number;
  kelly: number;
  fdHold: number | null;
  consensus: {
    books: number;
    sharpBooks: number;
    lineAdjusted: boolean;
    oneSided: boolean;
    method: DevigMethod;
    source: "consensus" | "fanduel-only";
  };
  best: Quote | null;
  quotes: Quote[];
  confidence: number;
  signals: Signal[];
  corr: CorrDescriptor;
  propStats?: PropStats | null;
  demo: boolean;
}

export interface InjuryItem {
  name: string;
  position?: string | null;
  status: string;
  detail?: string | null;
  date?: string | null;
  key: boolean;
}

export interface RecentGame {
  date: string;
  result: string;
  score: string;
  margin: number | null;
  opponent?: string | null;
  atVs?: string | null;
}

export interface TeamInfo {
  id?: string | null;
  name: string;
  abbr?: string | null;
  logo?: string | null;
  record?: string | null;
  homeRecord?: string | null;
  awayRecord?: string | null;
  recent: RecentGame[];
  last5Margin: number | null;
  last5Points: number | null;
  last5Allowed: number | null;
  restDays: number | null;
  injuries: InjuryItem[];
  pointsForPerGame: number | null;
  pointsAgainstPerGame: number | null;
  gamesPlayed: number | null;
  leaders: { category: string; name: string; value: string }[];
}

export interface LineMovement {
  provider: string;
  spreadOpen: number | null;
  spreadNow: number | null;
  totalOpen: number | null;
  totalNow: number | null;
  mlHomeOpen: number | null;
  mlHomeNow: number | null;
  mlAwayOpen: number | null;
  mlAwayNow: number | null;
}

export interface WeatherInfo {
  tempF: number | null;
  windMph: number | null;
  gustMph: number | null;
  precipPct: number | null;
  summary: string | null;
  source: "espn" | "open-meteo" | "both";
}

export interface GameInfo {
  espnId: string;
  venue: string | null;
  city: string | null;
  indoor: boolean | null;
  broadcast: string | null;
  weather: WeatherInfo | null;
  predictor: { home: number; away: number; tie: number | null } | null;
  movement: LineMovement | null;
  home: TeamInfo;
  away: TeamInfo;
  projectedMargin: number | null;
  projectedTotal: number | null;
  notes: string[];
}

export interface GameView {
  eventId: string;
  sport: string;
  sportLabel: string;
  commenceTime: string;
  home: string;
  away: string;
  homeAbbr: string | null;
  awayAbbr: string | null;
  homeLogo: string | null;
  awayLogo: string | null;
  espnId: string | null;
  fdEventLink: string | null;
  info: GameInfo | null;
  legIds: string[];
  bestEv: number | null;
}

export interface UsageInfo {
  remaining: number | null;
  used: number | null;
  last: number | null;
  updatedAt: string | null;
}

export interface SportStatus {
  key: string;
  label: string;
  games: number;
  error?: string | null;
}

export interface BoardResponse {
  generatedAt: string;
  mode: DataMode;
  oddsAgeSeconds: number | null;
  sports: SportStatus[];
  games: GameView[];
  legs: AnalyzedLeg[];
  usage: UsageInfo | null;
  warnings: string[];
}

export interface GameResponse {
  generatedAt: string;
  mode: DataMode;
  game: GameView;
  legs: AnalyzedLeg[];
  usage: UsageInfo | null;
  warnings: string[];
}

export interface PropsResponse {
  generatedAt: string;
  mode: DataMode;
  eventId: string;
  sport: string;
  legs: AnalyzedLeg[];
  markets: string[];
  usage: UsageInfo | null;
  warnings: string[];
}

export interface StatusResponse {
  mode: DataMode;
  hasKey: boolean;
  cacheSeconds: number;
  bookmakers: string[];
  usage: UsageInfo | null;
  sports: { key: string; label: string; active: boolean | null }[];
}

export interface GameResult {
  espnId: string;
  state: "pre" | "in" | "post";
  completed: boolean;
  detail: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface AnalysisSettings {
  method: DevigMethod;
  /** Multiplier on the default info weights. 0 means pure market. */
  infoWeight: number;
}

export const DEFAULT_ANALYSIS: AnalysisSettings = { method: "power", infoWeight: 1 };
