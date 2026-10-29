// FanDuel betslip deep links.
//
// Single picks use the format The Odds API returns:
//   https://sportsbook.fanduel.com/addToBetslip?marketId=42.4486&selectionId=29165
// Parlays use the indexed format FanDuel's own "share bet" feature builds:
//   ...addToBetslip?marketId[0]=..&selectionId[0]=..&marketId[1]=..&selectionId[1]=..

export const DEFAULT_FANDUEL_HOST = "sportsbook.fanduel.com";

export interface FanDuelSelection {
  marketId: string;
  selectionId: string;
}

export function parseFanDuelLink(link: string | null | undefined): FanDuelSelection | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    if (!url.pathname.toLowerCase().includes("addtobetslip")) return null;
    const marketId = url.searchParams.get("marketId") ?? url.searchParams.get("marketId[0]");
    const selectionId = url.searchParams.get("selectionId") ?? url.searchParams.get("selectionId[0]");
    if (!marketId || !selectionId) return null;
    return { marketId, selectionId };
  } catch {
    return null;
  }
}

function cleanHost(host?: string | null): string {
  const h = (host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return h || DEFAULT_FANDUEL_HOST;
}

export function fanDuelBetslipUrl(selections: FanDuelSelection[], host?: string | null): string | null {
  const valid = selections.filter((s) => s.marketId && s.selectionId);
  if (!valid.length) return null;
  const base = `https://${cleanHost(host)}/addToBetslip`;
  if (valid.length === 1) {
    const { marketId, selectionId } = valid[0];
    return `${base}?marketId=${encodeURIComponent(marketId)}&selectionId=${encodeURIComponent(selectionId)}`;
  }
  // Brackets are percent-encoded the same way FanDuel's encodeURI call does it.
  const query = valid
    .map((s, i) => `marketId%5B${i}%5D=${encodeURIComponent(s.marketId)}&selectionId%5B${i}%5D=${encodeURIComponent(s.selectionId)}`)
    .join("&");
  return `${base}?${query}`;
}

export function fanDuelHome(host?: string | null): string {
  return `https://${cleanHost(host)}/`;
}
