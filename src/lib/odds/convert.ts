// Odds format conversions. American odds are the FanDuel default, decimal odds
// are what the math runs on, and implied probability is 1 / decimal.

export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) return NaN;
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american;
}

/** Converts decimal odds to American. Pass round=false to keep the exact value. */
export function decimalToAmerican(decimal: number, round = true): number {
  if (!Number.isFinite(decimal) || decimal <= 1) return NaN;
  const raw = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
  return round ? Math.round(raw) : raw;
}

export function decimalToProb(decimal: number): number {
  return decimal > 0 ? 1 / decimal : NaN;
}

export function probToDecimal(prob: number): number {
  return prob > 0 ? 1 / prob : NaN;
}

export function americanToProb(american: number): number {
  return decimalToProb(americanToDecimal(american));
}

export function probToAmerican(prob: number): number {
  return decimalToAmerican(probToDecimal(prob));
}

export function formatAmerican(american: number): string {
  if (!Number.isFinite(american)) return "-";
  const rounded = Math.round(american);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function formatDecimal(decimal: number): string {
  return Number.isFinite(decimal) ? decimal.toFixed(2) : "-";
}

export function formatPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSignedPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "-";
  const pct = (value * 100).toFixed(digits);
  return value > 0 ? `+${pct}%` : `${pct}%`;
}

export function formatPoint(point: number | null | undefined, signed = true): string {
  if (point === null || point === undefined || !Number.isFinite(point)) return "";
  if (!signed) return `${point}`;
  return point > 0 ? `+${point}` : `${point}`;
}

export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}
