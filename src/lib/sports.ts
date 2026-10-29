// Sport registry. Keys match The Odds API; ESPN paths power the free info layer.

export type SportFamily = "football" | "basketball" | "hockey" | "baseball" | "soccer";

export interface PropMarketDef {
  key: string;
  label: string;
  /** Normalized stat group (shared with the correlation engine). */
  stat: string;
  /** ESPN gamelog stat names to add together for hit rates. */
  espn?: string[];
  /** Yes/No markets like anytime TD. */
  yesNo?: boolean;
  /** Count stats get a Poisson model, the rest a normal model. */
  count?: boolean;
}

export interface SportConfig {
  key: string;
  label: string;
  short: string;
  family: SportFamily;
  espn: { sport: string; league: string };
  /** Std dev of the final margin, used to move probabilities between spread lines. */
  marginSd: number;
  /** Std dev of the final combined score. */
  totalSd: number;
  /** Home field edge in points/goals/runs. */
  homeAdv: number;
  hasDraw: boolean;
  /** Days of ESPN schedule to load. NFL/NCAAF use the current week instead. */
  espnDays: number;
  weekly: boolean;
  outdoor: boolean;
  props: PropMarketDef[];
}

const NFL_PROPS: PropMarketDef[] = [
  { key: "player_pass_yds", label: "Pass Yds", stat: "pass_yds", espn: ["passingYards"] },
  { key: "player_pass_tds", label: "Pass TDs", stat: "pass_tds", espn: ["passingTouchdowns"], count: true },
  { key: "player_rush_yds", label: "Rush Yds", stat: "rush_yds", espn: ["rushingYards"] },
  { key: "player_reception_yds", label: "Rec Yds", stat: "rec_yds", espn: ["receivingYards"] },
  { key: "player_receptions", label: "Receptions", stat: "receptions", espn: ["receptions"], count: true },
  {
    key: "player_anytime_td",
    label: "Anytime TD",
    stat: "anytime_td",
    espn: ["rushingTouchdowns", "receivingTouchdowns"],
    yesNo: true,
    count: true,
  },
];

const NBA_PROPS: PropMarketDef[] = [
  { key: "player_points", label: "Points", stat: "points", espn: ["points"] },
  { key: "player_rebounds", label: "Rebounds", stat: "rebounds", espn: ["totalRebounds"], count: true },
  { key: "player_assists", label: "Assists", stat: "assists", espn: ["assists"], count: true },
  { key: "player_threes", label: "Threes", stat: "threes", espn: ["threePointFieldGoalsMade"], count: true },
  {
    key: "player_points_rebounds_assists",
    label: "Pts+Reb+Ast",
    stat: "pra",
    espn: ["points", "totalRebounds", "assists"],
  },
];

const NHL_PROPS: PropMarketDef[] = [
  { key: "player_points", label: "Points", stat: "points_hockey", espn: ["points"], count: true },
  { key: "player_shots_on_goal", label: "Shots on Goal", stat: "shots", espn: ["shotsTotal"], count: true },
  { key: "player_assists", label: "Assists", stat: "assists_hockey", espn: ["assists"], count: true },
  { key: "player_goal_scorer_anytime", label: "Anytime Goal", stat: "goals", espn: ["goals"], yesNo: true, count: true },
];

const MLB_PROPS: PropMarketDef[] = [
  { key: "batter_hits", label: "Hits", stat: "hits", espn: ["hits"], count: true },
  { key: "batter_total_bases", label: "Total Bases", stat: "total_bases", espn: ["totalBases"], count: true },
  { key: "batter_home_runs", label: "Home Runs", stat: "home_runs", espn: ["homeRuns"], count: true },
  { key: "pitcher_strikeouts", label: "Strikeouts (P)", stat: "pitcher_strikeouts", espn: ["strikeouts"], count: true },
];

const SOCCER_PROPS: PropMarketDef[] = [
  { key: "player_goal_scorer_anytime", label: "Anytime Goal", stat: "goals", yesNo: true, count: true },
  { key: "player_shots_on_target", label: "Shots on Target", stat: "shots_on_target", count: true },
];

export const SPORTS: SportConfig[] = [
  {
    key: "americanfootball_nfl",
    label: "NFL",
    short: "NFL",
    family: "football",
    espn: { sport: "football", league: "nfl" },
    marginSd: 13.5,
    totalSd: 10,
    homeAdv: 1.5,
    hasDraw: false,
    espnDays: 7,
    weekly: true,
    outdoor: true,
    props: NFL_PROPS,
  },
  {
    key: "americanfootball_ncaaf",
    label: "College Football",
    short: "NCAAF",
    family: "football",
    espn: { sport: "football", league: "college-football" },
    marginSd: 16,
    totalSd: 13.5,
    homeAdv: 2.5,
    hasDraw: false,
    espnDays: 7,
    weekly: true,
    outdoor: true,
    props: NFL_PROPS.slice(0, 5),
  },
  {
    key: "basketball_nba",
    label: "NBA",
    short: "NBA",
    family: "basketball",
    espn: { sport: "basketball", league: "nba" },
    marginSd: 12.5,
    totalSd: 18,
    homeAdv: 2,
    hasDraw: false,
    espnDays: 3,
    weekly: false,
    outdoor: false,
    props: NBA_PROPS,
  },
  {
    key: "basketball_ncaab",
    label: "College Basketball",
    short: "NCAAB",
    family: "basketball",
    espn: { sport: "basketball", league: "mens-college-basketball" },
    marginSd: 11,
    totalSd: 15,
    homeAdv: 3,
    hasDraw: false,
    espnDays: 3,
    weekly: false,
    outdoor: false,
    props: NBA_PROPS.slice(0, 3),
  },
  {
    key: "icehockey_nhl",
    label: "NHL",
    short: "NHL",
    family: "hockey",
    espn: { sport: "hockey", league: "nhl" },
    marginSd: 2.3,
    totalSd: 2.3,
    homeAdv: 0.15,
    hasDraw: false,
    espnDays: 3,
    weekly: false,
    outdoor: false,
    props: NHL_PROPS,
  },
  {
    key: "baseball_mlb",
    label: "MLB",
    short: "MLB",
    family: "baseball",
    espn: { sport: "baseball", league: "mlb" },
    marginSd: 4.4,
    totalSd: 4.4,
    homeAdv: 0.2,
    hasDraw: false,
    espnDays: 3,
    weekly: false,
    outdoor: true,
    props: MLB_PROPS,
  },
  {
    key: "soccer_epl",
    label: "Premier League",
    short: "EPL",
    family: "soccer",
    espn: { sport: "soccer", league: "eng.1" },
    marginSd: 1.7,
    totalSd: 1.6,
    homeAdv: 0.3,
    hasDraw: true,
    espnDays: 4,
    weekly: false,
    outdoor: true,
    props: SOCCER_PROPS,
  },
  {
    key: "soccer_uefa_champs_league",
    label: "Champions League",
    short: "UCL",
    family: "soccer",
    espn: { sport: "soccer", league: "uefa.champions" },
    marginSd: 1.7,
    totalSd: 1.6,
    homeAdv: 0.3,
    hasDraw: true,
    espnDays: 4,
    weekly: false,
    outdoor: true,
    props: SOCCER_PROPS,
  },
  {
    key: "soccer_usa_mls",
    label: "MLS",
    short: "MLS",
    family: "soccer",
    espn: { sport: "soccer", league: "usa.1" },
    marginSd: 1.7,
    totalSd: 1.7,
    homeAdv: 0.35,
    hasDraw: true,
    espnDays: 4,
    weekly: false,
    outdoor: true,
    props: SOCCER_PROPS,
  },
];

const BY_KEY = new Map(SPORTS.map((s) => [s.key, s]));

export function getSport(key: string): SportConfig | undefined {
  return BY_KEY.get(key);
}

export const DEFAULT_SPORTS = ["americanfootball_nfl", "basketball_nba", "icehockey_nhl", "americanfootball_ncaaf"];

export function propDef(sportKey: string, marketKey: string): PropMarketDef | undefined {
  return getSport(sportKey)?.props.find((p) => p.key === marketKey);
}

export const MARKET_LABELS: Record<string, string> = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Total",
};

export function marketLabel(sportKey: string, market: string): string {
  return MARKET_LABELS[market] ?? propDef(sportKey, market)?.label ?? market.replace(/^(player|batter|pitcher)_/, "").replace(/_/g, " ");
}
