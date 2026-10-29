"use client";

import type { DevigMethod } from "../odds/devig";
import { DEFAULT_SPORTS } from "../sports";
import { createPersistedStore } from "./persisted";

export interface UserSettings {
  bankroll: number;
  /** Fraction of full Kelly to stake. 0.25 = quarter Kelly. */
  kellyMultiplier: number;
  /** Hard cap per bet as a share of bankroll. */
  maxBetPct: number;
  method: DevigMethod;
  /** 0 = trust the market only, 1 = default info blend, 2 = lean on info twice as hard. */
  infoWeight: number;
  sports: string[];
  oddsFormat: "american" | "decimal";
  fanDuelHost: string;
  minConfidence: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  bankroll: 500,
  kellyMultiplier: 0.25,
  maxBetPct: 0.03,
  method: "power",
  infoWeight: 1,
  sports: DEFAULT_SPORTS,
  oddsFormat: "american",
  fanDuelHost: "sportsbook.fanduel.com",
  minConfidence: 0,
};

export const settingsStore = createPersistedStore<UserSettings>("parlaylab:settings", DEFAULT_SETTINGS, (raw) => ({
  ...DEFAULT_SETTINGS,
  ...(raw && typeof raw === "object" ? (raw as Partial<UserSettings>) : {}),
}));

export function useSettings(): UserSettings {
  return settingsStore.use();
}

export function updateSettings(patch: Partial<UserSettings>) {
  settingsStore.set((prev) => ({ ...prev, ...patch }));
}

export function analysisQuery(s: Pick<UserSettings, "method" | "infoWeight">): string {
  return `method=${s.method}&infoWeight=${s.infoWeight}`;
}
