// Matches The Odds API events to ESPN games by team names and start time.

const STOP = new Set(["fc", "afc", "cf", "sc", "the", "club", "de", "university", "univ", "of"]);

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter((t) => t && !STOP.has(t));
}

/** 0..1 similarity between two team names. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  const contained = [...ta].every((t) => tb.has(t)) || [...tb].every((t) => ta.has(t));
  return Math.min(1, jaccard + (contained ? 0.35 : 0));
}

export interface MatchCandidate {
  id: string;
  home: string;
  away: string;
  /** Extra aliases (abbreviation, short name) to compare against. */
  homeAliases?: string[];
  awayAliases?: string[];
  date: string;
}

function bestSim(name: string, primary: string, aliases: string[] = []): number {
  return Math.max(nameSimilarity(name, primary), ...aliases.map((a) => nameSimilarity(name, a)));
}

export function matchEvent<T extends MatchCandidate>(
  event: { home: string; away: string; date: string },
  candidates: T[],
  maxHours = 14,
): T | null {
  const t = Date.parse(event.date);
  let best: { c: T; score: number } | null = null;
  for (const c of candidates) {
    const hours = Math.abs(Date.parse(c.date) - t) / 3600000;
    if (!Number.isFinite(hours) || hours > maxHours) continue;
    const straight = bestSim(event.home, c.home, c.homeAliases) + bestSim(event.away, c.away, c.awayAliases);
    // Neutral site games sometimes flip home and away between providers.
    const flipped = bestSim(event.home, c.away, c.awayAliases) + bestSim(event.away, c.home, c.homeAliases);
    const score = Math.max(straight, flipped * 0.95) - hours * 0.01;
    if (score >= 1.1 && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? null;
}

/** Player name normalization for joining Odds API prop names to ESPN rosters. */
export function normalizePlayer(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "")
    .replace(/[^a-z ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
