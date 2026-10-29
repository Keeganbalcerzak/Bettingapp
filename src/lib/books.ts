// Bookmakers we pull and how much we trust each one's prices when building the
// fair line. Pinnacle and the BetOnline group take big limits from sharp bettors
// and move fast, so their prices carry the most information. FanDuel is the book
// we bet into, so it is left out of its own fair price.

export interface BookInfo {
  key: string;
  title: string;
  weight: number;
  sharp: boolean;
}

export const BOOKS: BookInfo[] = [
  { key: "pinnacle", title: "Pinnacle", weight: 3, sharp: true },
  { key: "betonlineag", title: "BetOnline", weight: 1.6, sharp: true },
  { key: "lowvig", title: "LowVig", weight: 1.6, sharp: true },
  { key: "draftkings", title: "DraftKings", weight: 1, sharp: false },
  { key: "fanduel", title: "FanDuel", weight: 0, sharp: false },
  { key: "betmgm", title: "BetMGM", weight: 0.8, sharp: false },
  { key: "williamhill_us", title: "Caesars", weight: 0.8, sharp: false },
  { key: "fanatics", title: "Fanatics", weight: 0.8, sharp: false },
  { key: "betrivers", title: "BetRivers", weight: 0.7, sharp: false },
  { key: "bovada", title: "Bovada", weight: 0.7, sharp: false },
  { key: "espnbet", title: "theScore Bet", weight: 0.8, sharp: false },
  { key: "hardrockbet", title: "Hard Rock", weight: 0.7, sharp: false },
  { key: "novig", title: "Novig", weight: 1.4, sharp: true },
  { key: "prophetx", title: "ProphetX", weight: 1.2, sharp: true },
];

const BY_KEY = new Map(BOOKS.map((b) => [b.key, b]));

export function bookInfo(key: string): BookInfo {
  return BY_KEY.get(key) ?? { key, title: key, weight: 0.6, sharp: false };
}

export const TARGET_BOOK = "fanduel";

export const DEFAULT_BOOKMAKERS = [
  "fanduel",
  "pinnacle",
  "draftkings",
  "betmgm",
  "williamhill_us",
  "betonlineag",
  "lowvig",
  "bovada",
  "betrivers",
  "fanatics",
];
