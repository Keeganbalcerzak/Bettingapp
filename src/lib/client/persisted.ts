"use client";

import { useSyncExternalStore } from "react";

// Tiny localStorage-backed store shared across components via useSyncExternalStore.
// Everything here is a per-browser convenience: the slip, settings and bet log
// live on this device only (export/import covers moving them).

export interface PersistedStore<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  use(): T;
}

export function createPersistedStore<T>(key: string, initial: T, migrate?: (raw: unknown) => T): PersistedStore<T> {
  let value: T = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        value = migrate ? migrate(parsed) : (parsed as T);
      }
    } catch {
      // Private mode or corrupted data: fall back to defaults.
    }
  };

  const store: PersistedStore<T> = {
    get() {
      load();
      return value;
    },
    set(next) {
      load();
      value = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage full or blocked; keep the in-memory value.
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) {
          loaded = false;
          load();
          listener();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    use() {
      return useSyncExternalStore(store.subscribe, store.get, () => initial);
    },
  };
  return store;
}
