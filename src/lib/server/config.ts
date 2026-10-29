import "server-only";
import { DEFAULT_BOOKMAKERS, TARGET_BOOK } from "../books";

export interface ServerConfig {
  oddsApiKey: string | null;
  cacheSeconds: number;
  bookmakers: string[];
}

export function getConfig(): ServerConfig {
  const key = process.env.ODDS_API_KEY?.trim();
  const cacheSeconds = Number(process.env.ODDS_CACHE_SECONDS ?? 600);
  const books = (process.env.ODDS_BOOKMAKERS ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  const list = books.length ? books : DEFAULT_BOOKMAKERS;
  if (!list.includes(TARGET_BOOK)) list.unshift(TARGET_BOOK);
  return {
    oddsApiKey: key ? key : null,
    cacheSeconds: Number.isFinite(cacheSeconds) && cacheSeconds >= 30 ? cacheSeconds : 600,
    bookmakers: [...new Set(list)],
  };
}
