import "server-only";
import { cached } from "./cache";
import { fetchJson } from "./http";

// Wind and rain at kickoff from Open-Meteo (free, no key). ESPN gives temperature
// but not wind, and wind is the weather factor that actually moves totals.

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

interface GeoResult {
  latitude: number;
  longitude: number;
  admin1?: string;
  country_code?: string;
}

async function geocode(city: string, state: string | null): Promise<{ lat: number; lon: number } | null> {
  const key = `geo:${city}|${state ?? ""}`;
  const res = await cached(key, 30 * 24 * 60 * 60 * 1000, async () => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`;
    const { data } = await fetchJson<{ results?: GeoResult[] }>(url, { timeoutMs: 8000 });
    const results = data.results ?? [];
    const stateName = state ? (US_STATES[state.toUpperCase()] ?? state) : null;
    const pick =
      (stateName && results.find((r) => r.admin1?.toLowerCase() === stateName.toLowerCase())) ||
      results.find((r) => r.country_code === "US") ||
      results[0];
    return pick ? { lat: pick.latitude, lon: pick.longitude } : null;
  });
  return res.value;
}

export interface KickoffWeather {
  tempF: number | null;
  windMph: number | null;
  gustMph: number | null;
  precipPct: number | null;
}

interface ForecastResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    precipitation_probability?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
  };
}

export async function kickoffWeather(city: string, state: string | null, isoTime: string): Promise<KickoffWeather | null> {
  const start = new Date(isoTime);
  if (Number.isNaN(start.getTime())) return null;
  const daysOut = (start.getTime() - Date.now()) / 86400000;
  if (daysOut > 14 || daysOut < -1) return null;
  const loc = await geocode(city, state);
  if (!loc) return null;
  const day = start.toISOString().slice(0, 10);
  const key = `wx:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}:${day}`;
  const res = await cached(key, 60 * 60 * 1000, async () => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m` +
      `&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC&start_date=${day}&end_date=${day}`;
    const { data } = await fetchJson<ForecastResponse>(url, { timeoutMs: 8000 });
    return data;
  });
  const hourly = res.value.hourly;
  const times = hourly?.time ?? [];
  if (!times.length) return null;
  // Average the first three hours of the game, which is what matters for the total.
  const startMs = start.getTime();
  const idx = times
    .map((t, i) => ({ i, ms: Date.parse(`${t}:00Z`) }))
    .filter((x) => x.ms >= startMs - 30 * 60 * 1000 && x.ms <= startMs + 3 * 60 * 60 * 1000)
    .map((x) => x.i);
  const pickIdx = idx.length ? idx : [Math.min(times.length - 1, start.getUTCHours())];
  const avg = (vals?: (number | null)[]) => {
    const xs = pickIdx.map((i) => vals?.[i]).filter((v): v is number => typeof v === "number");
    return xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : null;
  };
  const max = (vals?: (number | null)[]) => {
    const xs = pickIdx.map((i) => vals?.[i]).filter((v): v is number => typeof v === "number");
    return xs.length ? Math.max(...xs) : null;
  };
  return {
    tempF: avg(hourly?.temperature_2m),
    windMph: avg(hourly?.wind_speed_10m),
    gustMph: max(hourly?.wind_gusts_10m),
    precipPct: max(hourly?.precipitation_probability),
  };
}
