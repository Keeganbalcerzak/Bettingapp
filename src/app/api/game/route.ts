import type { NextRequest } from "next/server";
import { getSportBoard, parseSettings } from "@/lib/server/board";
import { getUsage } from "@/lib/server/oddsApi";
import { getSport } from "@/lib/sports";
import type { GameResponse } from "@/lib/types";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sport = getSport(params.get("sport") ?? "");
  const eventId = params.get("eventId") ?? "";
  if (!sport || !eventId) return Response.json({ error: "sport and eventId are required" }, { status: 400 });
  try {
    const board = await getSportBoard(sport, parseSettings(params), { focusEventId: eventId, force: params.get("refresh") === "1" });
    const game = board.games.find((g) => g.eventId === eventId);
    if (!game) return Response.json({ error: "Game not found. It may have started or is no longer listed." }, { status: 404 });
    const body: GameResponse = {
      generatedAt: new Date().toISOString(),
      mode: board.mode,
      game,
      legs: board.legs.filter((l) => l.eventId === eventId),
      usage: getUsage(),
      warnings: board.error ? [board.error] : [],
    };
    return Response.json(body);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
