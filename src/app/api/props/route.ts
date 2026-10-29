import type { NextRequest } from "next/server";
import { parseSettings } from "@/lib/server/board";
import { analyzeProps } from "@/lib/server/props";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sport = params.get("sport") ?? "";
  const eventId = params.get("eventId") ?? "";
  if (!sport || !eventId) return Response.json({ error: "sport and eventId are required" }, { status: 400 });
  const markets = (params.get("markets") ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  try {
    const res = await analyzeProps(sport, eventId, parseSettings(params), markets.length ? markets : null, params.get("refresh") === "1");
    return Response.json(res);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
