"use client";

import { useApi } from "@/lib/client/api";
import { DEFAULT_SETTINGS, settingsStore, updateSettings, useSettings } from "@/lib/client/settings";
import { bookInfo } from "@/lib/books";
import { DEVIG_METHODS } from "@/lib/odds/devig";
import type { StatusResponse } from "@/lib/types";
import { Badge, Button, Card, cn, Field, inputClass, SectionTitle, Segmented } from "@/components/ui";

const KELLY = [
  { value: 1, label: "Full", blurb: "Max growth if your probabilities are perfect. They are not." },
  { value: 0.5, label: "Half", blurb: "Aggressive. Big swings." },
  { value: 0.25, label: "Quarter", blurb: "Recommended. Most of the growth, a fraction of the risk." },
  { value: 0.125, label: "Eighth", blurb: "Very conservative." },
];

export function SettingsPage() {
  const s = useSettings();
  const { data: status } = useApi<StatusResponse>("/api/status", 60 * 1000);
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-2 mt-1">Saved in this browser.</p>
      </div>

      <section>
        <SectionTitle title="Bankroll and sizing" subtitle="Stake suggestions use fractional Kelly with a hard cap per bet." />
        <Card className="p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bankroll $" hint="Money set aside for betting that you can afford to lose. Stakes scale from this.">
              <input className={inputClass} inputMode="decimal" value={s.bankroll} onChange={(e) => updateSettings({ bankroll: Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0) })} />
            </Field>
            <Field label="Max bet, % of bankroll" hint="A ceiling on any single bet no matter what Kelly says.">
              <input
                className={inputClass}
                inputMode="decimal"
                value={Math.round(s.maxBetPct * 1000) / 10}
                onChange={(e) => updateSettings({ maxBetPct: Math.min(0.25, Math.max(0.001, (Number(e.target.value.replace(/[^0-9.]/g, "")) || 0) / 100)) })}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {KELLY.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => updateSettings({ kellyMultiplier: k.value })}
                className={cn("rounded-lg border p-2.5 text-left", s.kellyMultiplier === k.value ? "border-accent bg-accent-bg" : "border-line-2 hover:bg-surface-2")}
              >
                <p className="text-sm font-medium">{k.label} Kelly</p>
                <p className="text-xs text-ink-2">{k.blurb}</p>
              </button>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle title="Model" subtitle="How fair odds are built and how much the matchup info is allowed to move them." />
        <Card className="p-4 space-y-5">
          <div>
            <p className="text-xs font-medium text-ink-2 mb-1.5">No-vig method</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEVIG_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateSettings({ method: m.id })}
                  className={cn("rounded-lg border p-2.5 text-left", s.method === m.id ? "border-accent bg-accent-bg" : "border-line-2 hover:bg-surface-2")}
                >
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-ink-2">{m.blurb}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-ink-2">Info weight</p>
              <p className="text-sm tnum">{s.infoWeight === 0 ? "Market only" : `${s.infoWeight.toFixed(2)}x`}</p>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.25}
              value={s.infoWeight}
              onChange={(e) => updateSettings({ infoWeight: Number(e.target.value) })}
              className="w-full accent-[#2563eb]"
              aria-label="Info weight"
            />
            <p className="text-xs text-ink-2 mt-1">
              At 1x the info model (ESPN predictor, point differential, form, weather, player game logs) gets 4 to 20 percent of the vote depending on
              how good its inputs are, and can move a market probability by at most 3 points (4.5 on props). Sharp betting markets are hard to beat with public
              stats, so keep this modest. 0 trusts the market alone.
            </p>
          </div>
          <Field label="Hide bets below this confidence on the Today page">
            <input className={inputClass} type="number" min={0} max={99} value={s.minConfidence} onChange={(e) => updateSettings({ minConfidence: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })} />
          </Field>
        </Card>
      </section>

      <section>
        <SectionTitle title="Display and FanDuel" />
        <Card className="p-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-ink-2 mb-1.5">Odds format</p>
            <Segmented<"american" | "decimal">
              value={s.oddsFormat}
              onChange={(v) => updateSettings({ oddsFormat: v })}
              options={[
                { value: "american", label: "American" },
                { value: "decimal", label: "Decimal" },
              ]}
            />
          </div>
          <Field label="FanDuel site" hint="Betslip links open here. Change it only if FanDuel uses a different domain where you bet.">
            <input className={inputClass} value={s.fanDuelHost} onChange={(e) => updateSettings({ fanDuelHost: e.target.value.trim() })} />
          </Field>
        </Card>
      </section>

      <section>
        <SectionTitle title="Data sources" />
        <Card className="p-4 space-y-3 text-sm">
          <p className="flex items-center gap-2">
            Odds feed {status ? status.mode === "live" ? <Badge tone="pos">Live, The Odds API</Badge> : <Badge tone="warn">Demo, no key</Badge> : null}
          </p>
          {status?.mode === "demo" ? (
            <ol className="list-decimal pl-5 space-y-1 text-ink-2">
              <li>
                Get a free key at{" "}
                <a className="text-[#8ab4ff] hover:underline" href="https://the-odds-api.com/#get-access" target="_blank" rel="noopener noreferrer">
                  the-odds-api.com
                </a>{" "}
                (500 credits a month free).
              </li>
              <li>
                Copy <code className="text-ink">.env.example</code> to <code className="text-ink">.env.local</code> and set <code className="text-ink">ODDS_API_KEY</code>.
              </li>
              <li>Restart the app. The banner disappears and FanDuel prices and betslip links go live.</li>
            </ol>
          ) : null}
          {status ? (
            <dl className="grid gap-2 sm:grid-cols-3 text-xs">
              <div>
                <dt className="text-ink-3">Credits left this month</dt>
                <dd className="text-sm tnum">{status.usage?.remaining ?? (status.mode === "live" ? "Unknown until the first pull" : "-")}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Odds cache</dt>
                <dd className="text-sm tnum">{Math.round(status.cacheSeconds / 60)} min</dd>
              </div>
              <div>
                <dt className="text-ink-3">Cost per sport refresh</dt>
                <dd className="text-sm tnum">about 3 credits</dd>
              </div>
            </dl>
          ) : null}
          {status ? (
            <p className="text-xs text-ink-2">
              Books pulled: {status.bookmakers.map((b) => bookInfo(b).title).join(", ")}. Pinnacle, BetOnline and LowVig count the most because they
              move first when sharp money hits.
            </p>
          ) : null}
          <p className="text-xs text-ink-2">
            Free sources: ESPN (schedules, injuries, records, recent games, matchup predictor, opening lines, player game logs) and Open-Meteo (wind and
            rain at kickoff).
          </p>
        </Card>
      </section>

      <div>
        <Button variant="ghost" onClick={() => settingsStore.set(DEFAULT_SETTINGS)}>
          Reset settings
        </Button>
      </div>
    </div>
  );
}
