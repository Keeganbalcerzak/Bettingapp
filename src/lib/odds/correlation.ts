// Correlation between legs of the same game, used to price same game parlays.
//
// Each leg is treated as a threshold on a hidden normal variable (home margin,
// game total, or a player's stat line). Two legs on the same variable get a
// correlation of +/-1, which reproduces exact answers like "home -3 implies home
// wins". Everything else uses rough, conservative estimates; they are labeled as
// estimates in the UI.

export type CorrKind = "ml" | "spread" | "total" | "prop" | "other";

export interface CorrDescriptor {
  sport: string;
  eventId: string;
  kind: CorrKind;
  /** ml/spread: the team the leg is on. prop: the player's team when known. */
  teamSide?: "home" | "away" | null;
  /** +1 for over/yes/team-wins legs, -1 for under/no legs. */
  direction: 1 | -1;
  /** True when the home team is the favorite. Used for margin vs total. */
  homeFavored?: boolean | null;
  player?: string | null;
  /** Normalized stat group for props, e.g. "pass_yds", "points". */
  stat?: string | null;
}

const NEAR_ONE = 0.995;

// Game total vs a team's margin: favorites covering tends to come with more points.
const MARGIN_TOTAL: Record<string, number> = {
  football: 0.12,
  basketball: 0.08,
  hockey: 0.1,
  baseball: 0.1,
  soccer: 0.1,
};

function family(sport: string): string {
  if (sport.startsWith("americanfootball")) return "football";
  if (sport.startsWith("basketball")) return "basketball";
  if (sport.startsWith("icehockey")) return "hockey";
  if (sport.startsWith("baseball")) return "baseball";
  if (sport.startsWith("soccer")) return "soccer";
  return "other";
}

const PASSING = new Set(["pass_yds", "pass_tds", "pass_completions", "pass_attempts"]);
const RECEIVING = new Set(["rec_yds", "receptions", "rec_tds"]);

// Pairs of stats for the same player that move together strongly.
const SAME_PLAYER_RELATED: [string, string, number][] = [
  ["points", "pra", 0.85],
  ["points", "points_rebounds", 0.8],
  ["points", "points_assists", 0.8],
  ["rebounds", "pra", 0.55],
  ["assists", "pra", 0.5],
  ["rebounds", "points_rebounds", 0.6],
  ["assists", "points_assists", 0.55],
  ["threes", "points", 0.6],
  ["pass_yds", "pass_tds", 0.55],
  ["pass_yds", "pass_completions", 0.8],
  ["rec_yds", "receptions", 0.75],
  ["rec_yds", "rec_tds", 0.4],
  ["rush_yds", "rush_tds", 0.4],
  ["rush_yds", "rush_attempts", 0.75],
  ["shots", "goals", 0.4],
  ["points_hockey", "goals", 0.7],
  ["points_hockey", "assists_hockey", 0.65],
  ["hits", "total_bases", 0.8],
  ["total_bases", "home_runs", 0.65],
  ["hits", "hits_runs_rbis", 0.75],
];

function relatedSamePlayer(a: string, b: string): number {
  for (const [x, y, r] of SAME_PLAYER_RELATED) {
    if ((x === a && y === b) || (x === b && y === a)) return r;
  }
  return 0.35;
}

/** Hidden-variable sign for team legs: positive means "home margin goes up". */
function marginSign(d: CorrDescriptor): number {
  return d.teamSide === "home" ? 1 : -1;
}

function propVsTotal(d: CorrDescriptor, fam: string): number {
  if (d.stat === "pitcher_strikeouts") return -0.2;
  if (d.stat === "pitcher_outs") return -0.15;
  if (fam === "basketball") return 0.35;
  if (fam === "football") return 0.3;
  return 0.25;
}

function propVsOwnTeam(d: CorrDescriptor, fam: string): number {
  if (d.stat === "rush_yds" || d.stat === "rush_attempts") return 0.3;
  if (d.stat && PASSING.has(d.stat)) return -0.05;
  if (d.stat === "pitcher_strikeouts" || d.stat === "pitcher_outs") return 0.2;
  if (d.stat === "anytime_td" || d.stat === "goals") return 0.2;
  if (fam === "basketball") return 0.05;
  return 0.12;
}

export function legCorrelation(a: CorrDescriptor, b: CorrDescriptor): number {
  if (a.eventId !== b.eventId) return 0;
  const fam = family(a.sport);
  const dir = a.direction * b.direction;
  const isTeam = (d: CorrDescriptor) => d.kind === "ml" || d.kind === "spread";

  // Moneyline and spread are both thresholds on the same home margin.
  if (isTeam(a) && isTeam(b)) return NEAR_ONE * marginSign(a) * marginSign(b);

  // Two totals legs share the game total.
  if (a.kind === "total" && b.kind === "total") return NEAR_ONE * dir;

  // Team margin vs game total.
  if ((isTeam(a) && b.kind === "total") || (isTeam(b) && a.kind === "total")) {
    const team = isTeam(a) ? a : b;
    const total = isTeam(a) ? b : a;
    const base = MARGIN_TOTAL[fam] ?? 0.08;
    const favSign = team.homeFavored === false ? -1 : 1;
    return base * favSign * marginSign(team) * total.direction;
  }

  // Player prop vs game total.
  if ((a.kind === "prop" && b.kind === "total") || (b.kind === "prop" && a.kind === "total")) {
    const prop = a.kind === "prop" ? a : b;
    const total = a.kind === "prop" ? b : a;
    return propVsTotal(prop, fam) * prop.direction * total.direction;
  }

  // Player prop vs moneyline/spread.
  if ((a.kind === "prop" && isTeam(b)) || (b.kind === "prop" && isTeam(a))) {
    const prop = a.kind === "prop" ? a : b;
    const team = a.kind === "prop" ? b : a;
    if (!prop.teamSide) return 0;
    const sameTeam = prop.teamSide === team.teamSide ? 1 : -1;
    return propVsOwnTeam(prop, fam) * sameTeam * prop.direction;
  }

  // Prop vs prop.
  if (a.kind === "prop" && b.kind === "prop") {
    if (a.player && b.player && a.player === b.player) {
      if (a.stat && a.stat === b.stat) return NEAR_ONE * dir;
      return relatedSamePlayer(a.stat ?? "", b.stat ?? "") * dir;
    }
    if (a.teamSide && b.teamSide && a.teamSide === b.teamSide) {
      const passCatch =
        (a.stat && PASSING.has(a.stat) && b.stat && RECEIVING.has(b.stat)) ||
        (b.stat && PASSING.has(b.stat) && a.stat && RECEIVING.has(a.stat));
      return (passCatch ? 0.45 : 0.05) * dir;
    }
    return 0.1 * dir;
  }

  return 0;
}

/** Cholesky decomposition. Returns null when the matrix is not positive definite. */
export function cholesky(m: number[][]): number[][] | null {
  const n = m.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 1e-10) return null;
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Builds a valid correlation matrix for a set of legs. Pairwise guesses are not
 * always mutually consistent, so we shrink toward independence until the matrix
 * is positive definite.
 */
export function correlationMatrix(legs: CorrDescriptor[]): { matrix: number[][]; chol: number[][]; shrink: number } {
  const n = legs.length;
  const raw = legs.map((a, i) => legs.map((b, j) => (i === j ? 1 : legCorrelation(a, b))));
  for (let step = 0; step <= 20; step++) {
    const shrink = step / 20;
    const m = raw.map((row, i) => row.map((v, j) => (i === j ? 1 : v * (1 - shrink))));
    const chol = cholesky(m);
    if (chol) return { matrix: m, chol, shrink };
  }
  const identity = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  return { matrix: identity, chol: identity, shrink: 1 };
}
