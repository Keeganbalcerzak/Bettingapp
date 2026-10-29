import "server-only";

// In-memory TTL cache with in-flight de-duplication. Lives on globalThis so dev
// hot reloads do not wipe it (which would burn Odds API credits).

interface Entry {
  value: unknown;
  storedAt: number;
  expires: number;
}

interface CacheState {
  entries: Map<string, Entry>;
  inflight: Map<string, Promise<unknown>>;
}

const globalKey = "__parlaylab_cache__";
const g = globalThis as unknown as Record<string, CacheState | undefined>;
const state: CacheState = g[globalKey] ?? { entries: new Map(), inflight: new Map() };
g[globalKey] = state;

const MAX_ENTRIES = 3000;

export interface Cached<T> {
  value: T;
  storedAt: number;
  hit: boolean;
  stale: boolean;
}

export interface CacheOptions {
  /** Ignore a fresh entry and reload (used by the refresh button). */
  force?: boolean;
  /** Never reload more often than this, even when forced. */
  minAgeMs?: number;
}

function evict() {
  if (state.entries.size <= MAX_ENTRIES) return;
  const oldest = [...state.entries.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  for (const [key] of oldest.slice(0, state.entries.size - MAX_ENTRIES)) state.entries.delete(key);
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>, options: CacheOptions = {}): Promise<Cached<T>> {
  const now = Date.now();
  const entry = state.entries.get(key);
  const age = entry ? now - entry.storedAt : Infinity;
  const fresh = entry && now < entry.expires;
  const forceAllowed = options.force && age >= (options.minAgeMs ?? 0);
  if (entry && fresh && !forceAllowed) {
    return { value: entry.value as T, storedAt: entry.storedAt, hit: true, stale: false };
  }

  let pending = state.inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = loader();
    state.inflight.set(key, pending);
  }
  try {
    const value = await pending;
    const storedAt = Date.now();
    state.entries.set(key, { value, storedAt, expires: storedAt + ttlMs });
    evict();
    return { value, storedAt, hit: false, stale: false };
  } catch (err) {
    // Serve stale data rather than failing the page when an upstream hiccups.
    if (entry) return { value: entry.value as T, storedAt: entry.storedAt, hit: true, stale: true };
    throw err;
  } finally {
    state.inflight.delete(key);
  }
}

export function peek<T>(key: string): Cached<T> | null {
  const entry = state.entries.get(key);
  if (!entry) return null;
  return { value: entry.value as T, storedAt: entry.storedAt, hit: true, stale: Date.now() >= entry.expires };
}
