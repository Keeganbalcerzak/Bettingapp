"use client";

import { useCallback, useEffect, useState } from "react";

// Minimal fetch hook with a shared in-memory cache so hopping between pages
// does not refetch (or spend Odds API credits).

interface Entry {
  data?: unknown;
  error?: string;
  at: number;
  promise?: Promise<void>;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function notify(url: string) {
  listeners.get(url)?.forEach((l) => l());
}

async function load(url: string, force: boolean) {
  const entry = cache.get(url) ?? { at: 0 };
  if (entry.promise) return entry.promise;
  const target = force ? `${url}${url.includes("?") ? "&" : "?"}refresh=1` : url;
  entry.promise = (async () => {
    try {
      const res = await fetch(target, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
      entry.data = body;
      entry.error = undefined;
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
    } finally {
      entry.at = Date.now();
      entry.promise = undefined;
      notify(url);
    }
  })();
  cache.set(url, entry);
  notify(url);
  return entry.promise;
}

export interface ApiState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  refresh: () => void;
}

export function useApi<T>(url: string | null, staleMs = 5 * 60 * 1000): ApiState<T> {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    const set = listeners.get(url) ?? new Set();
    const l = () => setTick((t) => t + 1);
    set.add(l);
    listeners.set(url, set);
    const entry = cache.get(url);
    if (!entry || (!entry.promise && Date.now() - entry.at > staleMs)) void load(url, false);
    return () => {
      set.delete(l);
    };
  }, [url, staleMs]);
  const refresh = useCallback(() => {
    if (url) void load(url, true);
  }, [url]);
  const entry = url ? cache.get(url) : undefined;
  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    loading: !!url && (!entry || !!entry.promise),
    refresh,
  };
}
