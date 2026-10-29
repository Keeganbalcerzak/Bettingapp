"use client";

import { ChevronRight, Cross, Gauge, LineChart, Wind } from "lucide-react";
import Link from "next/link";
import { formatPoint } from "@/lib/odds/convert";
import type { AnalyzedLeg, GameView } from "@/lib/types";
import { Badge, Card } from "./ui";
import { formatStart, PriceButton } from "./legs";

function TeamLine({ name, abbr, logo, record }: { name: string; abbr: string | null; logo: string | null; record?: string | null }) {
  return (
    <div className="flex items-center gap-2 min-w-0 h-12">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain shrink-0" loading="lazy" />
      ) : (
        <span className="h-[22px] w-[22px] rounded-full bg-surface-3 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink truncate" title={name}>
          <span className="sm:hidden">{abbr || name}</span>
          <span className="hidden sm:inline">{name}</span>
        </p>
        <p className="text-[11px] text-ink-3 tnum truncate">
          <span className="hidden sm:inline">
            {abbr}
            {record ? " · " : ""}
          </span>
          {record}
        </p>
      </div>
    </div>
  );
}

export function GameInsights({ game }: { game: GameView }) {
  const info = game.info;
  if (!info) return null;
  const badges: React.ReactNode[] = [];
  if (info.predictor) {
    const fav = info.predictor.home >= info.predictor.away ? (info.home.abbr ?? "Home") : (info.away.abbr ?? "Away");
    badges.push(
      <Badge key="pred" title="ESPN matchup predictor">
        <Gauge className="h-3 w-3" aria-hidden />
        ESPN {fav} {(Math.max(info.predictor.home, info.predictor.away) * 100).toFixed(0)}%
      </Badge>,
    );
  }
  const keyOut = [...info.home.injuries, ...info.away.injuries].filter((i) => i.key);
  if (keyOut.length) {
    badges.push(
      <Badge key="inj" tone="warn" title={keyOut.map((i) => `${i.name} (${i.status})`).join(", ")}>
        <Cross className="h-3 w-3" aria-hidden />
        {keyOut.length} key out
      </Badge>,
    );
  }
  const mv = info.movement;
  if (mv && mv.spreadOpen !== null && mv.spreadNow !== null && mv.spreadOpen !== mv.spreadNow) {
    badges.push(
      <Badge key="mv" title={`Spread moved since open (${mv.provider})`}>
        <LineChart className="h-3 w-3" aria-hidden />
        {info.home.abbr ?? "Home"} {formatPoint(mv.spreadOpen)} to {formatPoint(mv.spreadNow)}
      </Badge>,
    );
  }
  if (info.weather?.windMph !== null && info.weather?.windMph !== undefined && info.weather.windMph >= 12) {
    badges.push(
      <Badge key="wx" tone={info.weather.windMph >= 15 ? "warn" : "neutral"} title="Wind at kickoff">
        <Wind className="h-3 w-3" aria-hidden />
        {Math.round(info.weather.windMph)} mph
      </Badge>,
    );
  }
  for (const t of [info.away, info.home]) {
    if (t.restDays === 0 && (game.sport.startsWith("basketball") || game.sport.startsWith("icehockey"))) {
      badges.push(
        <Badge key={`b2b-${t.abbr}`} tone="warn">
          {t.abbr} back-to-back
        </Badge>,
      );
    }
  }
  return badges.length ? <div className="flex flex-wrap gap-1.5">{badges}</div> : null;
}

export function GameCard({ game, legs }: { game: GameView; legs: Map<string, AnalyzedLeg> }) {
  const pick = (market: string, side: string) => game.legIds.map((id) => legs.get(id)).find((l) => l && l.market === market && l.side === side);
  const draw = pick("h2h", "draw");
  const hasSpread = game.legIds.some((id) => legs.get(id)?.market === "spreads");
  const cols = hasSpread
    ? "grid-cols-[4.75rem_repeat(3,minmax(0,1fr))] sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(4.5rem,6rem))]"
    : "grid-cols-[4.75rem_repeat(2,minmax(0,1fr))] sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(4.5rem,6rem))]";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs text-ink-3">
          <span className="text-ink-2 font-medium">{game.sportLabel}</span> · {formatStart(game.commenceTime)}
          {game.info?.broadcast ? ` · ${game.info.broadcast}` : ""}
        </p>
        <Link href={`/game/${game.sport}/${encodeURIComponent(game.eventId)}`} className="inline-flex items-center gap-0.5 text-xs text-[#8ab4ff] hover:underline">
          Matchup info
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <div className={`grid ${cols} gap-2 items-center`}>
        <div />
        {hasSpread ? <p className="text-[11px] text-ink-3 text-center">Spread</p> : null}
        <p className="text-[11px] text-ink-3 text-center">Moneyline</p>
        <p className="text-[11px] text-ink-3 text-center">Total</p>

        <TeamLine name={game.away} abbr={game.awayAbbr} logo={game.awayLogo} record={game.info?.away.record} />
        {hasSpread ? <PriceButton leg={pick("spreads", "away")} /> : null}
        <PriceButton leg={pick("h2h", "away")} showLine={false} />
        <PriceButton leg={pick("totals", "over")} />

        <TeamLine name={game.home} abbr={game.homeAbbr} logo={game.homeLogo} record={game.info?.home.record} />
        {hasSpread ? <PriceButton leg={pick("spreads", "home")} /> : null}
        <PriceButton leg={pick("h2h", "home")} showLine={false} />
        <PriceButton leg={pick("totals", "under")} />

        {draw ? (
          <>
            <div className="flex items-center h-12 text-sm text-ink-2 sm:pl-[30px]">Draw</div>
            {hasSpread ? <div /> : null}
            <PriceButton leg={draw} showLine={false} />
            <div />
          </>
        ) : null}
      </div>
      <div className="mt-3">
        <GameInsights game={game} />
      </div>
    </Card>
  );
}
