import { getConfig } from "@/lib/server/config";
import { getUsage, listSports } from "@/lib/server/oddsApi";
import { SPORTS } from "@/lib/sports";
import type { StatusResponse } from "@/lib/types";
import { connection } from "next/server";

export async function GET() {
  await connection();
  const config = getConfig();
  let active = new Map<string, boolean>();
  if (config.oddsApiKey) {
    try {
      active = new Map((await listSports()).map((s) => [s.key, s.active]));
    } catch {
      // The sports list is only used for the in-season badges.
    }
  }
  const body: StatusResponse = {
    mode: config.oddsApiKey ? "live" : "demo",
    hasKey: !!config.oddsApiKey,
    cacheSeconds: config.cacheSeconds,
    bookmakers: config.bookmakers,
    usage: getUsage(),
    sports: SPORTS.map((s) => ({ key: s.key, label: s.label, active: active.size ? (active.get(s.key) ?? false) : null })),
  };
  return Response.json(body);
}
