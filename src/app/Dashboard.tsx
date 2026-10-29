"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { BoardToolbar, ModeBanner } from "@/components/BoardStatus";
import { LegRow } from "@/components/legs";
import { ParlayCard } from "@/components/SuggestedParlays";
import { Card, Empty, SectionTitle, SkeletonRows, Stat, TextLink } from "@/components/ui";
import { useBoard } from "@/lib/client/board";
import { useSettings } from "@/lib/client/settings";
import { toOptimizerLeg } from "@/lib/legs";
import { formatSignedPct } from "@/lib/odds/convert";
import { optimizeParlays } from "@/lib/odds/optimizer";

export function Dashboard() {
  const { data: board, loading, error, refresh } = useBoard();
  const settings = useSettings();

  const legsById = useMemo(() => new Map((board?.legs ?? []).map((l) => [l.id, l])), [board]);
  const best = useMemo(
    () =>
      (board?.legs ?? [])
        .filter((l) => l.ev > 0 && l.marketEv > -0.01 && l.confidence >= Math.max(45, settings.minConfidence) && l.consensus.source === "consensus")
        .sort((a, b) => b.ev - a.ev)
        .slice(0, 10),
    [board, settings.minConfidence],
  );
  const parlays = useMemo(() => {
    if (!board) return [];
    const pool = board.legs.filter((l) => l.consensus.source === "consensus" && l.confidence >= 40 && l.marketEv > -0.01).map(toOptimizerLeg);
    return optimizeParlays(pool, { minLegs: 2, maxLegs: 4, objective: "growth", kellyMultiplier: settings.kellyMultiplier, minLegEv: 0, maxResults: 3, diverse: true }).parlays.filter(
      (p) => p.pricing.ev > 0,
    );
  }, [board, settings.kellyMultiplier]);

  const plusEv = board?.legs.filter((l) => l.ev > 0).length ?? 0;
  const top = best[0];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Today&apos;s edge</h1>
        <p className="text-sm text-ink-2 mt-1 max-w-3xl">
          Every FanDuel price compared against a no-vig line built from sharper books, then checked against injuries, form, rest, weather, line
          movement and ESPN&apos;s matchup model. Positive EV means FanDuel is paying more than the bet is worth.
        </p>
      </div>
      <ModeBanner board={board} />
      <BoardToolbar board={board} loading={loading} onRefresh={refresh} />

      {error && !board ? (
        <Empty title="Could not load odds">{error}</Empty>
      ) : !board ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Games on the board" value={board.games.length} sub={board.sports.map((s) => `${s.label} ${s.games}`).join(" · ")} />
            <Stat label="FanDuel bets checked" value={board.legs.length} sub="Moneylines, spreads and totals" />
            <Stat label="Positive EV right now" value={plusEv} sub={board.legs.length ? `${((plusEv / board.legs.length) * 100).toFixed(0)}% of prices` : undefined} tone={plusEv ? "pos" : undefined} />
            <Stat label="Best edge" value={top ? formatSignedPct(top.ev) : "-"} sub={top ? top.label : "Nothing beats the market yet"} tone={top ? "pos" : undefined} />
          </div>

          <section>
            <SectionTitle
              title="Best single bets"
              subtitle="Highest EV FanDuel prices with real outside prices behind them. Tap Add to build a parlay."
              right={<TextLink href="/board">See the full board</TextLink>}
            />
            {best.length ? (
              <div className="space-y-2">
                {best.map((l) => (
                  <LegRow key={l.id} leg={l} />
                ))}
              </div>
            ) : (
              <Empty title="No +EV prices right now">FanDuel is not beating the sharp market on anything loaded. Check back closer to game time or add sports.</Empty>
            )}
          </section>

          <section>
            <SectionTitle
              title="Suggested parlays"
              subtitle="Built by the optimizer from +EV legs in different games, ranked for long-run bankroll growth."
              right={<TextLink href="/parlay">Tune it in the builder</TextLink>}
            />
            {parlays.length ? (
              <div className="grid gap-3 md:grid-cols-3">
                {parlays.map((p, i) => (
                  <ParlayCard key={p.legs.map((l) => l.id).join("+")} parlay={p} legs={legsById} index={i} />
                ))}
              </div>
            ) : (
              <Card className="p-5 text-sm text-ink-2 flex gap-3">
                <Sparkles className="h-5 w-5 text-ink-3 shrink-0" aria-hidden />
                <p>
                  Not enough +EV legs in different games to make a parlay worth betting. A parlay of -EV legs compounds the house edge on every leg,
                  so the optimizer would rather show nothing. Try a FanDuel profit boost in the builder, which can flip the math.
                </p>
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
