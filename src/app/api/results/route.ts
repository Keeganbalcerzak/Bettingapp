import type { NextRequest } from "next/server";
import { getSummary } from "@/lib/server/espn";
import { mapLimitSettled } from "@/lib/server/http";
import { getSport } from "@/lib/sports";
import type { GameResult } from "@/lib/types";

// Final scores from ESPN, used to auto-settle tracked bets. Free, no credits.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sport = getSport(params.get("sport") ?? "");
  const ids = (params.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!sport || !ids.length) return Response.json({ error: "sport and ids are required" }, { status: 400 });
  const summaries = await mapLimitSettled(ids, 5, (id) => getSummary(sport, id, { force: true, minAgeMs: 2 * 60 * 1000 }));
  const results: GameResult[] = ids.map((id, i) => {
    const s = summaries[i];
    return {
      espnId: id,
      state: s?.state ?? "pre",
      completed: s?.completed ?? false,
      detail: s?.statusDetail ?? "",
      homeScore: s?.homeScore ?? null,
      awayScore: s?.awayScore ?? null,
    };
  });
  return Response.json({ results });
}
