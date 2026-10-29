"use client";

import { Download, RefreshCw, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { PnlChart, type PnlPoint } from "@/components/PnlChart";
import { Badge, Button, Card, cn, Empty, SectionTitle, Segmented, Stat, useDecimalOdds, useOdds } from "@/components/ui";
import { applyLegResults, betProfit, deleteBet, replaceBets, setLegResult, settleWholeBet, useBets, type TrackedBet } from "@/lib/client/bets";
import { formatMoney, formatPct, formatSignedPct } from "@/lib/odds/convert";
import { boostedDecimal } from "@/lib/odds/ev";
import { gradeLeg, type LegResult } from "@/lib/settle";
import { getSport } from "@/lib/sports";
import type { GameResult } from "@/lib/types";

type Filter = "all" | "open" | "settled";

/** Running actual and expected profit across settled bets, oldest first. */
function pnlSeries(bets: TrackedBet[]): PnlPoint[] {
  const ordered = bets.filter((b) => b.status !== "open").sort((a, b) => (a.settledAt ?? a.createdAt).localeCompare(b.settledAt ?? b.createdAt));
  const out: PnlPoint[] = [];
  let act = 0;
  let exp = 0;
  for (const b of ordered) {
    act += betProfit(b);
    exp += b.stake * b.ev;
    out.push({ label: b.legs.map((l) => l.label).join(" + "), actual: Math.round(act * 100) / 100, expected: Math.round(exp * 100) / 100 });
  }
  return out;
}

const STATUS_TONE: Record<string, "neutral" | "pos" | "neg" | "warn" | "accent"> = {
  open: "accent",
  won: "pos",
  lost: "neg",
  push: "neutral",
  void: "neutral",
};

export function Tracker() {
  const bets = useBets();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const settled = bets.filter((b) => b.status !== "open");
  const staked = settled.reduce((s, b) => s + b.stake, 0);
  const profit = settled.reduce((s, b) => s + betProfit(b), 0);
  const expected = settled.reduce((s, b) => s + b.stake * b.ev, 0);
  const wins = settled.filter((b) => b.status === "won").length;
  const decided = settled.filter((b) => b.status === "won" || b.status === "lost");
  const expectedWins = decided.reduce((s, b) => s + b.prob, 0);
  const openRisk = bets.filter((b) => b.status === "open").reduce((s, b) => s + b.stake, 0);

  const points = useMemo(() => pnlSeries(bets), [bets]);

  const visible = bets.filter((b) => filter === "all" || (filter === "open" ? b.status === "open" : b.status !== "open"));

  const autoSettle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const open = bets.filter((b) => b.status === "open");
      const bySport = new Map<string, Set<string>>();
      for (const b of open)
        for (const l of b.legs)
          if (!l.result && l.espnId && ["h2h", "spreads", "totals"].includes(l.market) && Date.parse(l.commenceTime) < Date.now()) {
            const set = bySport.get(l.sport) ?? new Set<string>();
            set.add(l.espnId);
            bySport.set(l.sport, set);
          }
      const finals = new Map<string, GameResult>();
      for (const [sport, ids] of bySport) {
        const res = await fetch(`/api/results?sport=${encodeURIComponent(sport)}&ids=${[...ids].join(",")}`);
        const body = (await res.json()) as { results?: GameResult[] };
        for (const r of body.results ?? []) if (r.completed) finals.set(r.espnId, r);
      }
      const results = new Map<string, LegResult>();
      let graded = 0;
      for (const b of open)
        for (const l of b.legs) {
          const f = l.espnId ? finals.get(l.espnId) : undefined;
          if (!f || f.homeScore === null || f.awayScore === null || l.result) continue;
          const r = gradeLeg(l, f.homeScore, f.awayScore);
          if (r) {
            results.set(`${l.id}|${b.id}`, r);
            graded++;
          }
        }
      applyLegResults(results);
      setMessage(graded ? `Graded ${graded} leg${graded > 1 ? "s" : ""} from final scores.` : "No finished games to grade yet. Player props are graded by hand.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const exportBets = () => {
    const blob = new Blob([JSON.stringify(bets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parlaylab-bets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBets = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!Array.isArray(parsed)) throw new Error("That file is not a ParlayLab bet export.");
      replaceBets(parsed as TrackedBet[]);
      setMessage(`Imported ${parsed.length} bets.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bet tracker</h1>
          <p className="text-sm text-ink-2 mt-1 max-w-2xl">
            Results swing a lot in the short run. The number that tells you if your process works is expected profit: if actual profit tracks it over
            a few hundred bets, the edges are real. Saved in this browser only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={autoSettle} disabled={busy}>
            <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} aria-hidden />
            Grade from final scores
          </Button>
          <Button variant="ghost" onClick={exportBets} disabled={!bets.length}>
            <Download className="h-4 w-4" aria-hidden />
            Export
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden />
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBets(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      {message ? <p className="text-sm text-ink-2">{message}</p> : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Profit" value={formatMoney(profit)} tone={profit > 0 ? "pos" : profit < 0 ? "neg" : undefined} sub={staked ? `${formatSignedPct(profit / staked)} ROI on ${formatMoney(staked)}` : "No settled bets yet"} />
        <Stat label="Expected profit" value={formatMoney(expected)} sub={staked ? `${formatSignedPct(expected / staked)} expected ROI` : "Sum of stake x EV"} />
        <Stat label="Record" value={`${wins}-${decided.length - wins}`} sub={decided.length ? `Expected ${expectedWins.toFixed(1)} wins` : undefined} />
        <Stat label="Open bets" value={bets.length - settled.length} sub={openRisk ? `${formatMoney(openRisk)} at risk` : undefined} />
      </div>

      {points.length >= 2 ? (
        <Card className="p-4">
          <SectionTitle title="Profit over time" subtitle="Cumulative profit against what the EV of each bet predicted." />
          <PnlChart points={points} />
        </Card>
      ) : null}

      <section>
        <SectionTitle
          title="Bets"
          right={
            <Segmented<Filter>
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "settled", label: "Settled" },
              ]}
            />
          }
        />
        {visible.length ? (
          <div className="space-y-2">
            {visible.map((b) => (
              <BetCard key={b.id} bet={b} />
            ))}
          </div>
        ) : (
          <Empty title="No bets logged">Build a slip and hit Log bet to start tracking.</Empty>
        )}
      </section>
    </div>
  );
}

const RESULT_OPTIONS: { value: LegResult; label: string }[] = [
  { value: "won", label: "W" },
  { value: "lost", label: "L" },
  { value: "push", label: "P" },
];

function BetCard({ bet }: { bet: TrackedBet }) {
  const odds = useOdds();
  const decOdds = useDecimalOdds();
  const profit = betProfit(bet);
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-3">
            {new Date(bet.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} · {bet.legs.length === 1 ? "Straight" : `${bet.legs.length} leg ${bet.sameGame ? "SGP" : "parlay"}`}
            {bet.boostPct ? ` · ${bet.boostPct}% boost` : ""}
            {bet.demo ? " · demo prices" : ""}
          </p>
          <p className="text-sm font-semibold tnum">
            {formatMoney(bet.stake)} at {decOdds(boostedDecimal(bet.decimal, bet.boostPct))}{" "}
            <span className="font-normal text-ink-2">
              · {formatPct(bet.prob)} to hit · {formatSignedPct(bet.ev)} EV
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[bet.status]}>{bet.status.toUpperCase()}</Badge>
          {bet.status !== "open" ? <span className={cn("text-sm font-semibold tnum", profit > 0 ? "text-pos" : profit < 0 ? "text-neg" : "text-ink-2")}>{formatMoney(profit)}</span> : null}
        </div>
      </div>
      <ul className="mt-2 divide-y divide-line">
        {bet.legs.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0 text-sm">
              <span className="text-ink">{l.label}</span>{" "}
              <span className="text-xs text-ink-3">
                {getSport(l.sport)?.short ?? ""} · {l.away} @ {l.home} · {odds(l.american)}
              </span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {RESULT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setLegResult(bet.id, l.id, l.result === o.value ? null : o.value)}
                  className={cn(
                    "h-6 w-6 rounded-md border text-[11px] font-semibold",
                    l.result === o.value
                      ? o.value === "won"
                        ? "border-[#1d4d2f] bg-pos-bg text-pos"
                        : o.value === "lost"
                          ? "border-[#5a2326] bg-neg-bg text-neg"
                          : "border-line-2 bg-surface-3 text-ink"
                      : "border-line-2 text-ink-3 hover:text-ink",
                  )}
                  aria-pressed={l.result === o.value}
                  aria-label={`Mark ${l.label} ${o.value}`}
                >
                  {o.label}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        {bet.status === "open" ? (
          <>
            <Button size="sm" onClick={() => settleWholeBet(bet.id, "won")}>
              Won
            </Button>
            <Button size="sm" onClick={() => settleWholeBet(bet.id, "lost")}>
              Lost
            </Button>
            <Button size="sm" variant="ghost" onClick={() => settleWholeBet(bet.id, "void")}>
              Void
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => settleWholeBet(bet.id, "open")}>
            Reopen
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => deleteBet(bet.id)} className="ml-auto">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete
        </Button>
      </div>
      {bet.notes ? <p className="mt-1 text-xs text-ink-3">{bet.notes}</p> : null}
    </Card>
  );
}
