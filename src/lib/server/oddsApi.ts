import "server-only";
import type { UsageInfo } from "../types";
import { cached, type CacheOptions } from "./cache";
import { getConfig } from "./config";
import { fetchJson, HttpError } from "./http";

// Client for The Odds API v4 (https://the-odds-api.com/liveapi/guides/v4/).
// Every response is cached so a page refresh does not cost credits.

const BASE = "https://api.the-odds-api.com/v4";

export interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
  description?: string;
  link?: string | null;
  sid?: string | null;
}

export interface OddsApiMarket {
  key: string;
  last_update?: string;
  link?: string | null;
  sid?: string | null;
  outcomes: OddsApiOutcome[];
}

export interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update?: string;
  link?: string | null;
  sid?: string | null;
  markets: OddsApiMarket[];
}

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
}

export interface OddsApiSport {
  key: string;
  group: string;
  title: string;
  active: boolean;
  has_outrights: boolean;
}

const usageKey = "__parlaylab_usage__";
const g = globalThis as unknown as Record<string, UsageInfo | undefined>;

function recordUsage(headers: Headers) {
  const n = (k: string) => {
    const v = headers.get(k);
    return v === null ? null : Number(v);
  };
  const remaining = n("x-requests-remaining");
  if (remaining === null) return;
  g[usageKey] = {
    remaining,
    used: n("x-requests-used"),
    last: n("x-requests-last"),
    updatedAt: new Date().toISOString(),
  };
}

export function getUsage(): UsageInfo | null {
  return g[usageKey] ?? null;
}

function friendlyError(err: unknown): Error {
  if (err instanceof HttpError) {
    if (err.status === 401) return new Error("The Odds API rejected the key (401). Check ODDS_API_KEY.");
    if (err.status === 429) return new Error("The Odds API rate limit or monthly quota was hit (429).");
    if (err.status === 422) return new Error(`The Odds API refused the request (422): ${err.message}`);
    return new Error(`The Odds API error: ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

async function request<T>(path: string, params: Record<string, string>): Promise<T> {
  const { oddsApiKey } = getConfig();
  if (!oddsApiKey) throw new Error("ODDS_API_KEY is not set.");
  const qs = new URLSearchParams({ ...params, apiKey: oddsApiKey });
  try {
    const { data, headers } = await fetchJson<T>(`${BASE}${path}?${qs.toString()}`, { timeoutMs: 15000 });
    recordUsage(headers);
    return data;
  } catch (err) {
    throw friendlyError(err);
  }
}

export async function listSports(): Promise<OddsApiSport[]> {
  // The sports list is free, so a long cache is only about speed.
  const res = await cached("oddsapi:sports", 60 * 60 * 1000, () => request<OddsApiSport[]>("/sports", {}));
  return res.value;
}

export async function getOdds(
  sport: string,
  markets: string[] = ["h2h", "spreads", "totals"],
  options: CacheOptions = {},
): Promise<{ events: OddsApiEvent[]; storedAt: number }> {
  const { cacheSeconds, bookmakers } = getConfig();
  const key = `oddsapi:odds:${sport}:${markets.join(",")}:${bookmakers.join(",")}`;
  const res = await cached(
    key,
    cacheSeconds * 1000,
    () =>
      request<OddsApiEvent[]>(`/sports/${sport}/odds`, {
        bookmakers: bookmakers.join(","),
        markets: markets.join(","),
        oddsFormat: "american",
        dateFormat: "iso",
        includeLinks: "true",
        includeSids: "true",
      }),
    { minAgeMs: 60 * 1000, ...options },
  );
  return { events: res.value, storedAt: res.storedAt };
}

export async function getEventOdds(
  sport: string,
  eventId: string,
  markets: string[],
  options: CacheOptions = {},
): Promise<{ event: OddsApiEvent; storedAt: number }> {
  const { cacheSeconds, bookmakers } = getConfig();
  const key = `oddsapi:event:${sport}:${eventId}:${markets.join(",")}:${bookmakers.join(",")}`;
  const res = await cached(
    key,
    cacheSeconds * 1000,
    () =>
      request<OddsApiEvent>(`/sports/${sport}/events/${eventId}/odds`, {
        bookmakers: bookmakers.join(","),
        markets: markets.join(","),
        oddsFormat: "american",
        dateFormat: "iso",
        includeLinks: "true",
        includeSids: "true",
      }),
    { minAgeMs: 60 * 1000, ...options },
  );
  return { event: res.value, storedAt: res.storedAt };
}
