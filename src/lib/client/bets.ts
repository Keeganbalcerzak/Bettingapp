"use client";

import { boostedDecimal } from "../odds/ev";
import { gradeParlay, type BetStatus, type LegResult } from "../settle";
import type { AnalyzedLeg } from "../types";
import { createPersistedStore } from "./persisted";

export interface TrackedLeg {
  id: string;
  label: string;
  sport: string;
  eventId: string;
  espnId: string | null;
  market: string;
  side: string;
  point: number | null;
  player: string | null;
  home: string;
  away: string;
  commenceTime: string;
  american: number;
  decimal: number;
  fairProb: number;
  modelProb: number;
  result: LegResult | null;
}

export interface TrackedBet {
  id: string;
  createdAt: string;
  legs: TrackedLeg[];
  stake: number;
  /** Price at placement before any boost. */
  decimal: number;
  boostPct: number;
  /** Our win probability at placement. */
  prob: number;
  fairProb: number;
  ev: number;
  sameGame: boolean;
  status: BetStatus;
  settledAt: string | null;
  payout: number | null;
  notes: string;
  demo: boolean;
}

export const betsStore = createPersistedStore<TrackedBet[]>("parlaylab:bets", [], (raw) => (Array.isArray(raw) ? (raw as TrackedBet[]) : []));

export function useBets(): TrackedBet[] {
  return betsStore.use();
}

export function trackedLeg(leg: AnalyzedLeg): TrackedLeg {
  return {
    id: leg.id,
    label: leg.label,
    sport: leg.sport,
    eventId: leg.eventId,
    espnId: leg.espnId ?? null,
    market: leg.market,
    side: leg.side,
    point: leg.point ?? null,
    player: leg.player ?? null,
    home: leg.home,
    away: leg.away,
    commenceTime: leg.commenceTime,
    american: leg.fd.american,
    decimal: leg.fd.decimal,
    fairProb: leg.fairProb,
    modelProb: leg.modelProb,
    result: null,
  };
}

export function addBet(bet: Omit<TrackedBet, "id" | "createdAt" | "status" | "settledAt" | "payout">) {
  const id = `bet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  betsStore.set((list) => [{ ...bet, id, createdAt: new Date().toISOString(), status: "open", settledAt: null, payout: null }, ...list]);
}

/** Re-grades a bet from its leg results. A same game parlay's payout is approximate after a push. */
function regrade(bet: TrackedBet): TrackedBet {
  const graded = gradeParlay(bet.legs.map((l) => ({ decimal: l.decimal, result: l.result })));
  if (graded.status === "open") return { ...bet, status: "open", settledAt: null, payout: null };
  const allWon = bet.legs.every((l) => l.result === "won");
  const decimal = allWon ? bet.decimal : graded.decimal;
  const payout =
    graded.status === "won" ? bet.stake * boostedDecimal(decimal, bet.boostPct) : graded.status === "lost" ? 0 : bet.stake;
  return { ...bet, status: graded.status, settledAt: bet.settledAt ?? new Date().toISOString(), payout: Math.round(payout * 100) / 100 };
}

export function setLegResult(betId: string, legId: string, result: LegResult | null) {
  betsStore.set((list) =>
    list.map((b) => (b.id === betId ? regrade({ ...b, legs: b.legs.map((l) => (l.id === legId ? { ...l, result } : l)) }) : b)),
  );
}

export function settleWholeBet(betId: string, status: Exclude<BetStatus, "open"> | "open") {
  betsStore.set((list) =>
    list.map((b) => {
      if (b.id !== betId) return b;
      if (status === "open") return { ...b, status: "open", settledAt: null, payout: null, legs: b.legs.map((l) => ({ ...l, result: null })) };
      const result: LegResult = status;
      return regrade({ ...b, legs: b.legs.map((l) => ({ ...l, result: l.result ?? result })), settledAt: null });
    }),
  );
}

export function applyLegResults(results: Map<string, LegResult>) {
  betsStore.set((list) =>
    list.map((b) => {
      if (b.status !== "open") return b;
      let changed = false;
      const legs = b.legs.map((l) => {
        const r = results.get(l.id + "|" + b.id) ?? results.get(l.id);
        if (r && !l.result) {
          changed = true;
          return { ...l, result: r };
        }
        return l;
      });
      return changed ? regrade({ ...b, legs }) : b;
    }),
  );
}

export function deleteBet(betId: string) {
  betsStore.set((list) => list.filter((b) => b.id !== betId));
}

export function replaceBets(bets: TrackedBet[]) {
  betsStore.set(bets);
}

export function betProfit(b: TrackedBet): number {
  return b.payout === null ? 0 : b.payout - b.stake;
}
