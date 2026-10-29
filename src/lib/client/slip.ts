"use client";

import type { AnalyzedLeg } from "../types";
import { createPersistedStore } from "./persisted";

export interface SlipState {
  legs: AnalyzedLeg[];
  boostPct: number;
  /** FanDuel's same game parlay price, typed in by the user. */
  sgpAmerican: string;
  stake: string;
}

const EMPTY: SlipState = { legs: [], boostPct: 0, sgpAmerican: "", stake: "" };

export const slipStore = createPersistedStore<SlipState>("parlaylab:slip", EMPTY, (raw) => ({
  ...EMPTY,
  ...(raw && typeof raw === "object" ? (raw as Partial<SlipState>) : {}),
}));

export function useSlip(): SlipState {
  return slipStore.use();
}

export function toggleLeg(leg: AnalyzedLeg) {
  slipStore.set((s) => {
    const exists = s.legs.some((l) => l.id === leg.id);
    // Picking the other side of a market replaces the old pick, like a real betslip.
    const sameMarket = (l: AnalyzedLeg) => l.eventId === leg.eventId && l.market === leg.market && (l.player ?? "") === (leg.player ?? "");
    const legs = exists ? s.legs.filter((l) => l.id !== leg.id) : [...s.legs.filter((l) => !sameMarket(l)), leg];
    return { ...s, legs, sgpAmerican: "" };
  });
}

export function removeLeg(id: string) {
  slipStore.set((s) => ({ ...s, legs: s.legs.filter((l) => l.id !== id), sgpAmerican: "" }));
}

export function setSlipLegs(legs: AnalyzedLeg[]) {
  slipStore.set((s) => ({ ...s, legs, sgpAmerican: "" }));
}

export function clearSlip() {
  slipStore.set((s) => ({ ...s, legs: [], sgpAmerican: "", stake: "" }));
}

export function updateSlip(patch: Partial<SlipState>) {
  slipStore.set((s) => ({ ...s, ...patch }));
}

/** Refreshes slip legs with newer prices when the board reloads. */
export function refreshSlipLegs(fresh: AnalyzedLeg[]) {
  const byId = new Map(fresh.map((l) => [l.id, l]));
  const current = slipStore.get();
  if (!current.legs.some((l) => byId.has(l.id) && byId.get(l.id) !== l)) return;
  slipStore.set((s) => ({ ...s, legs: s.legs.map((l) => byId.get(l.id) ?? l) }));
}
