"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { BoardToolbar, ModeBanner } from "@/components/BoardStatus";
import { GameCard } from "@/components/GameCard";
import { LegRow } from "@/components/legs";
import { Empty, inputClass, Segmented, SkeletonRows } from "@/components/ui";
import { useBoard } from "@/lib/client/board";
import type { AnalyzedLeg } from "@/lib/types";

type View = "games" | "bets";
type MarketFilter = "all" | "h2h" | "spreads" | "totals";
type Sort = "ev" | "confidence" | "time";

export function BoardPage() {
  const { data: board, loading, error, refresh } = useBoard();
  const [view, setView] = useState<View>("games");
  const [market, setMarket] = useState<MarketFilter>("all");
  const [sort, setSort] = useState<Sort>("ev");
  const [plusOnly, setPlusOnly] = useState(false);
  const [query, setQuery] = useState("");

  const legsById = useMemo(() => new Map((board?.legs ?? []).map((l) => [l.id, l])), [board]);
  const q = query.trim().toLowerCase();
  const matchesQuery = (l: Pick<AnalyzedLeg, "home" | "away" | "homeAbbr" | "awayAbbr">) =>
    !q || [l.home, l.away, l.homeAbbr ?? "", l.awayAbbr ?? ""].some((s) => s.toLowerCase().includes(q));

  const legs = useMemo(() => {
    const list = (board?.legs ?? []).filter(
      (l) => (market === "all" || l.market === market) && (!plusOnly || l.ev > 0) && matchesQuery(l),
    );
    const by: Record<Sort, (a: AnalyzedLeg, b: AnalyzedLeg) => number> = {
      ev: (a, b) => b.ev - a.ev,
      confidence: (a, b) => b.confidence - a.confidence || b.ev - a.ev,
      time: (a, b) => a.commenceTime.localeCompare(b.commenceTime) || b.ev - a.ev,
    };
    return list.sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, market, plusOnly, sort, q]);

  const games = useMemo(() => {
    const list = (board?.games ?? []).filter((g) => matchesQuery(g) && (!plusOnly || (g.bestEv ?? -1) > 0));
    if (sort === "ev") return [...list].sort((a, b) => (b.bestEv ?? -1) - (a.bestEv ?? -1));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, plusOnly, sort, q]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Odds board</h1>
        <p className="text-sm text-ink-2 mt-1">
          Every price shows FanDuel&apos;s odds and its EV against the fair line. Green means FanDuel is overpaying. Tap a price to add it to your slip.
        </p>
      </div>
      <ModeBanner board={board} />
      <BoardToolbar board={board} loading={loading} onRefresh={refresh} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "games", label: "Games" },
            { value: "bets", label: "All bets" },
          ]}
        />
        {view === "bets" ? (
          <Segmented<MarketFilter>
            value={market}
            onChange={setMarket}
            options={[
              { value: "all", label: "All" },
              { value: "h2h", label: "Moneyline" },
              { value: "spreads", label: "Spread" },
              { value: "totals", label: "Total" },
            ]}
          />
        ) : null}
        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: "ev", label: "Best EV" },
            { value: "confidence", label: "Confidence" },
            { value: "time", label: "Start time" },
          ]}
        />
        <label className="inline-flex items-center gap-2 text-sm text-ink-2 cursor-pointer select-none">
          <input type="checkbox" checked={plusOnly} onChange={(e) => setPlusOnly(e.target.checked)} className="accent-[#2563eb]" />
          +EV only
        </label>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-3" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teams" className={`${inputClass} pl-9`} />
        </div>
      </div>

      {error && !board ? (
        <Empty title="Could not load odds">{error}</Empty>
      ) : !board ? (
        <SkeletonRows rows={8} />
      ) : view === "games" ? (
        games.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {games.map((g) => (
              <GameCard key={g.eventId} game={g} legs={legsById} />
            ))}
          </div>
        ) : (
          <Empty title="No games match">Try another sport or clear the filters.</Empty>
        )
      ) : legs.length ? (
        <div className="space-y-2">
          {legs.slice(0, 300).map((l) => (
            <LegRow key={l.id} leg={l} />
          ))}
          {legs.length > 300 ? <p className="text-xs text-ink-3 text-center pt-2">Showing the top 300 of {legs.length}. Narrow the filters to see more.</p> : null}
        </div>
      ) : (
        <Empty title="No bets match">Try another market or clear the filters.</Empty>
      )}
    </div>
  );
}
