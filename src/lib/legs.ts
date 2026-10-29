import { fanDuelBetslipUrl } from "./fanduel";
import type { OptimizerLeg } from "./odds/optimizer";
import type { ParlayLegInput } from "./odds/parlay";
import type { AnalyzedLeg } from "./types";

/** One pick per market: FanDuel treats each player prop as its own market. */
export function marketKey(leg: AnalyzedLeg): string {
  return `${leg.eventId}|${leg.market}|${leg.player ?? ""}`;
}

export function toParlayLeg(leg: AnalyzedLeg): ParlayLegInput {
  return {
    id: leg.id,
    eventId: leg.eventId,
    marketKey: marketKey(leg),
    side: leg.side,
    point: leg.point ?? null,
    decimal: leg.fd.decimal,
    prob: leg.modelProb,
    fairProb: leg.fairProb,
    corr: leg.corr,
    label: leg.label,
  };
}

export function toOptimizerLeg(leg: AnalyzedLeg): OptimizerLeg {
  return { ...toParlayLeg(leg), ev: leg.ev };
}

export interface SlipLink {
  url: string | null;
  linked: number;
  missing: number;
}

/** FanDuel betslip link for a set of legs. Legs without FanDuel ids are skipped. */
export function slipLink(legs: AnalyzedLeg[], host?: string | null): SlipLink {
  const ids = legs
    .filter((l) => l.fd.marketId && l.fd.selectionId)
    .map((l) => ({ marketId: l.fd.marketId!, selectionId: l.fd.selectionId! }));
  return { url: fanDuelBetslipUrl(ids, host), linked: ids.length, missing: legs.length - ids.length };
}

export function gameLabel(leg: Pick<AnalyzedLeg, "home" | "away" | "homeAbbr" | "awayAbbr">): string {
  return `${leg.awayAbbr || leg.away} @ ${leg.homeAbbr || leg.home}`;
}
