"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { updateSettings, useSettings } from "@/lib/client/settings";
import { SPORTS } from "@/lib/sports";
import type { BoardResponse } from "@/lib/types";
import { Badge, Button, cn } from "./ui";

function age(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return "just now";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function ModeBanner({ board }: { board: BoardResponse | undefined }) {
  if (!board || board.mode === "live") return null;
  return (
    <div className="mb-5 rounded-xl border border-[#5a4517] bg-warn-bg px-4 py-3 text-sm text-ink-2">
      <p className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" aria-hidden />
        <span>
          <span className="font-medium text-warn">Demo mode.</span> Schedules, injuries, form, weather, ESPN&apos;s predictor and player game logs are
          real. DraftKings lines come from ESPN, and the other sportsbook prices (including FanDuel) are simulated around them. Add a free{" "}
          <a className="text-[#8ab4ff] hover:underline" href="https://the-odds-api.com/#get-access" target="_blank" rel="noopener noreferrer">
            Odds API key
          </a>{" "}
          as <code className="text-ink">ODDS_API_KEY</code> to get live FanDuel prices and one-tap betslip links. See{" "}
          <Link href="/settings" className="text-[#8ab4ff] hover:underline">
            Settings
          </Link>
          .
        </span>
      </p>
    </div>
  );
}

export function BoardToolbar({ board, loading, onRefresh }: { board: BoardResponse | undefined; loading: boolean; onRefresh: () => void }) {
  const settings = useSettings();
  const toggle = (key: string) => {
    const has = settings.sports.includes(key);
    const next = has ? settings.sports.filter((s) => s !== key) : [...settings.sports, key];
    if (next.length) updateSettings({ sports: next });
  };
  const counts = new Map(board?.sports.map((s) => [s.key, s.games]) ?? []);
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {SPORTS.map((s) => {
        const on = settings.sports.includes(s.key);
        const n = counts.get(s.key);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              on ? "border-accent bg-accent-bg text-ink" : "border-line-2 text-ink-2 hover:text-ink",
            )}
            aria-pressed={on}
          >
            {s.short}
            {on && n !== undefined ? <span className="ml-1 text-ink-3 tnum">{n}</span> : null}
          </button>
        );
      })}
      <div className="ml-auto flex items-center gap-2">
        {board ? (
          <span className="text-xs text-ink-3">
            {board.mode === "live" ? <Badge tone="pos">Live odds</Badge> : <Badge tone="warn">Demo</Badge>} {board.oddsAgeSeconds !== null ? `odds ${age(board.oddsAgeSeconds)}` : ""}
            {board.usage?.remaining !== null && board.usage?.remaining !== undefined ? ` · ${board.usage.remaining} credits left` : ""}
          </span>
        ) : null}
        <Button size="sm" onClick={onRefresh} disabled={loading} title={board?.mode === "live" ? "Re-pulls odds. Costs about 3 credits per sport." : "Reloads data"}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      </div>
      {board?.warnings.length ? (
        <div className="basis-full rounded-lg border border-[#5a2326] bg-neg-bg px-3 py-2 text-xs text-neg">
          {board.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
