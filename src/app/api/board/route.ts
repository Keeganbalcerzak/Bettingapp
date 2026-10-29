import type { NextRequest } from "next/server";
import { buildBoard, parseSettings } from "@/lib/server/board";
import { DEFAULT_SPORTS } from "@/lib/sports";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sports = (params.get("sports") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const board = await buildBoard(sports.length ? sports : DEFAULT_SPORTS, parseSettings(params), params.get("refresh") === "1");
    return Response.json(board);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
