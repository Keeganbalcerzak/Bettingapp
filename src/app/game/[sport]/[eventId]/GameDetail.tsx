"use client";

import { ArrowLeft, ChevronDown, Cloud, Gauge, LineChart, MapPin, Tv, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HitChart } from "@/components/HitChart";
import { formatStart, keySignals, SignalList, useInSlip } from "@/components/legs";
import { Badge, Button, Card, cn, ConfidenceMeter, Empty, EvBadge, SectionTitle, SkeletonRows, Spinner, useOdds } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import { analysisQuery, useSettings } from "@/lib/client/settings";
import { toggleLeg } from "@/lib/client/slip";
import { bookInfo } from "@/lib/books";
import { formatPct, formatPoint, probToAmerican } from "@/lib/odds/convert";
import { getSport } from "@/lib/sports";
import type { AnalyzedLeg, GameInfo, GameResponse, PropsResponse, TeamInfo } from "@/lib/types";

const MARKET_ORDER = ["h2h", "spreads", "totals"];

export function GameDetail({ sport, eventId }: { sport: string; eventId: string }) {
  const settings = useSettings();
  const q = analysisQuery(settings);
  const { data, error, loading, refresh } = useApi<GameResponse>(`/api/game?sport=${encodeURIComponent(sport)}&eventId=${encodeURIComponent(eventId)}&${q}`);
  if (error && !data) return <Empty title="Could not load this game">{error}</Empty>;
  if (!data) return <SkeletonRows rows={6} />;
  const { game, legs } = data;
  const info = game.info;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/board" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Odds board
        </Link>
      </div>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <TeamLogo src={game.awayLogo} />
          <div>
            <p className="text-xs text-ink-3">
              {game.sportLabel} · {formatStart(game.commenceTime)} {data.mode === "demo" ? <Badge tone="warn">Demo prices</Badge> : <Badge tone="pos">Live</Badge>}
            </p>
            <h1 className="text-xl sm:text-2xl font-semibold">
              {game.away} <span className="text-ink-3 font-normal">at</span> {game.home}
            </h1>
            <p className="text-xs text-ink-2 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {info?.venue ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {info.venue}
                  {info.city ? `, ${info.city}` : ""}
                  {info.indoor ? " (indoor)" : ""}
                </span>
              ) : null}
              {info?.broadcast ? (
                <span className="inline-flex items-center gap-1">
                  <Tv className="h-3.5 w-3.5" aria-hidden />
                  {info.broadcast}
                </span>
              ) : null}
            </p>
          </div>
          <TeamLogo src={game.homeLogo} />
        </div>
        <div className="flex gap-2">
          {game.fdEventLink ? (
            <a href={game.fdEventLink} target="_blank" rel="noopener noreferrer" className="text-sm text-[#8ab4ff] hover:underline self-center">
              Game on FanDuel
            </a>
          ) : null}
          <Button size="sm" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        </div>
      </header>

      {info?.notes.length ? (
        <Card className="p-4">
          <ul className="list-disc pl-5 space-y-1 text-sm text-ink-2">
            {info.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section>
        <SectionTitle title="Game lines" subtitle="FanDuel's price, the fair price after removing the vig, and every other book we track for line shopping." />
        <div className="space-y-2">
          {MARKET_ORDER.flatMap((m) => legs.filter((l) => l.market === m)).map((l) => (
            <LegDetail key={l.id} leg={l} />
          ))}
        </div>
      </section>

      {info ? <InfoPanels info={info} sport={sport} /> : null}

      <PropsPanel sport={sport} eventId={eventId} mode={data.mode} />
    </div>
  );
}

function TeamLogo({ src }: { src: string | null }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={44} height={44} className="h-11 w-11 object-contain" />;
}

export function LegDetail({ leg }: { leg: AnalyzedLeg }) {
  const [open, setOpen] = useState(false);
  const inSlip = useInSlip();
  const odds = useOdds();
  const selected = inSlip(leg.id);
  const quotes = [...leg.quotes].sort((a, b) => (b.american > 0 ? 100 + b.american : 100 - 10000 / b.american) - (a.american > 0 ? 100 + a.american : 100 - 10000 / a.american));
  return (
    <Card className={cn("p-3", selected && "border-accent")}>
      <div className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,0.9fr))_auto] sm:items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{leg.label}</p>
          <p className="text-xs text-ink-3 truncate">{keySignals(leg, 2).map((s) => s.label).join(" · ")}</p>
        </div>
        <div className="text-right sm:text-left">
          <p className="text-xs text-ink-3">FanDuel</p>
          <p className="text-sm font-semibold tnum">{odds(leg.fd.american)}</p>
        </div>
        <div className="hidden sm:block">
          <p className="text-xs text-ink-3">Market fair / ours</p>
          <p className="text-sm tnum text-ink-2">
            {formatPct(leg.fairProb)} / <span className="text-ink">{formatPct(leg.modelProb)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 sm:block">
          <EvBadge ev={leg.ev} />
          <div className="sm:mt-1">
            <ConfidenceMeter value={leg.confidence} compact />
          </div>
        </div>
        <div className="flex items-center gap-1.5 justify-self-end">
          <Button size="sm" variant={selected ? "primary" : "secondary"} onClick={() => toggleLeg(leg)}>
            {selected ? "In slip" : "Add"}
          </Button>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Show details" className="rounded-md p-1 text-ink-2 hover:bg-surface-2">
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      </div>
      {open ? (
        <div className="mt-3 grid gap-4 border-t border-line pt-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-ink-2 mb-2">Why</p>
            <SignalList signals={leg.signals} />
          </div>
          <div>
            <p className="text-xs font-medium text-ink-2 mb-2">Prices across books</p>
            <div className="flex flex-wrap gap-1.5">
              {quotes.map((qt) => (
                <span key={qt.book} className={cn("rounded-md border px-2 py-1 text-xs tnum", qt.book === "fanduel" ? "border-accent text-ink" : "border-line-2 text-ink-2")}>
                  {bookInfo(qt.book).title} {qt.point !== null && qt.point !== undefined && leg.market !== "h2h" ? `${leg.market === "spreads" ? formatPoint(qt.point) : qt.point} ` : ""}
                  <span className="text-ink">{odds(qt.american)}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-3">
              Fair price {odds(probToAmerican(leg.modelProb))} ({formatPct(leg.modelProb)}). Market only {odds(probToAmerican(leg.fairProb))}, {leg.consensus.books} book
              {leg.consensus.books === 1 ? "" : "s"}, {leg.consensus.sharpBooks} sharp, {leg.consensus.method} devig
              {leg.infoProb !== null ? `. Info model ${formatPct(leg.infoProb)} at ${Math.round(leg.infoWeight * 100)}% weight` : ""}.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function TeamColumn({ team, sport }: { team: TeamInfo; sport: string }) {
  const fam = getSport(sport)?.family;
  const unit = fam === "hockey" || fam === "soccer" ? "goals" : fam === "baseball" ? "runs" : "pts";
  return (
    <div className="space-y-3 min-w-0">
      <p className="font-medium">
        {team.name} <span className="text-ink-3 text-sm tnum">{team.record}</span>
      </p>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-ink-3">Scored / game</dt>
          <dd className="text-sm tnum">{team.pointsForPerGame !== null ? team.pointsForPerGame.toFixed(1) : "-"}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Allowed / game</dt>
          <dd className="text-sm tnum">{team.pointsAgainstPerGame !== null ? team.pointsAgainstPerGame.toFixed(1) : "-"}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Home / road</dt>
          <dd className="text-sm tnum">
            {team.homeRecord ?? "-"} / {team.awayRecord ?? "-"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Rest</dt>
          <dd className="text-sm tnum">{team.restDays !== null ? `${team.restDays} day${team.restDays === 1 ? "" : "s"}` : "-"}</dd>
        </div>
      </dl>
      {team.recent.length ? (
        <div>
          <p className="text-xs text-ink-3 mb-1">
            Last {team.recent.length}
            {team.last5Margin !== null ? ` · avg margin ${team.last5Margin > 0 ? "+" : ""}${team.last5Margin.toFixed(1)} ${unit}` : ""}
          </p>
          <div className="flex flex-wrap gap-1">
            {team.recent.map((r, i) => (
              <span
                key={`${r.date}-${i}`}
                title={`${r.atVs ?? ""} ${r.opponent ?? ""} ${r.score}`}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px] tnum",
                  r.result === "W" ? "border-[#1d4d2f] text-pos" : r.result === "L" ? "border-[#5a2326] text-neg" : "border-line-2 text-ink-2",
                )}
              >
                {r.result} {r.score}
                {r.opponent ? ` ${r.atVs === "@" ? "@" : "v"} ${r.opponent}` : ""}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className="text-xs text-ink-3 mb-1">Injuries</p>
        {team.injuries.length ? (
          <ul className="space-y-1 text-xs">
            {team.injuries.slice(0, 10).map((i) => (
              <li key={i.name} className="flex justify-between gap-2">
                <span className={cn("truncate", i.key ? "text-warn" : "text-ink-2")}>
                  {i.name} {i.position ? <span className="text-ink-3">{i.position}</span> : null}
                  {i.key ? " · key" : ""}
                </span>
                <span className="text-ink-3 shrink-0">{i.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-2">None reported</p>
        )}
      </div>
      {team.leaders.length ? (
        <div>
          <p className="text-xs text-ink-3 mb-1">Leaders</p>
          <ul className="space-y-0.5 text-xs text-ink-2">
            {team.leaders.slice(0, 4).map((l) => (
              <li key={`${l.category}-${l.name}`} className="truncate">
                <span className="text-ink">{l.name}</span> · {l.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function InfoPanels({ info, sport }: { info: GameInfo; sport: string }) {
  const mv = info.movement;
  const odds = useOdds();
  return (
    <section>
      <SectionTitle title="Matchup info" subtitle="Everything besides the odds that feeds the model and the confidence score." />
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Gauge className="h-4 w-4 text-ink-3" aria-hidden />
            Models
          </p>
          {info.predictor ? (
            <div>
              <p className="text-xs text-ink-3 mb-1.5">ESPN matchup predictor</p>
              <ProbBar left={info.away.abbr ?? "Away"} right={info.home.abbr ?? "Home"} leftP={info.predictor.away} rightP={info.predictor.home} />
            </div>
          ) : (
            <p className="text-xs text-ink-2">No ESPN predictor for this league. The model uses point differential and recent form instead.</p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-ink-3">Projected margin</dt>
              <dd className="text-sm tnum">
                {info.projectedMargin !== null ? `${info.projectedMargin >= 0 ? info.home.abbr : info.away.abbr} by ${Math.abs(info.projectedMargin).toFixed(1)}` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Stat model total</dt>
              <dd className="text-sm tnum">{info.projectedTotal !== null ? info.projectedTotal.toFixed(1) : "-"}</dd>
            </div>
          </dl>
        </Card>
        <Card className="p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <LineChart className="h-4 w-4 text-ink-3" aria-hidden />
            Line movement {mv ? <span className="text-xs font-normal text-ink-3">({mv.provider}, open to now)</span> : null}
          </p>
          {mv ? (
            <dl className="space-y-2 text-sm">
              <MoveRow label={`${info.home.abbr ?? "Home"} spread`} open={mv.spreadOpen !== null ? formatPoint(mv.spreadOpen) : null} now={mv.spreadNow !== null ? formatPoint(mv.spreadNow) : null} />
              <MoveRow label="Total" open={mv.totalOpen !== null ? String(mv.totalOpen) : null} now={mv.totalNow !== null ? String(mv.totalNow) : null} />
              <MoveRow label={`${info.home.abbr ?? "Home"} moneyline`} open={mv.mlHomeOpen !== null ? odds(mv.mlHomeOpen) : null} now={mv.mlHomeNow !== null ? odds(mv.mlHomeNow) : null} />
              <MoveRow label={`${info.away.abbr ?? "Away"} moneyline`} open={mv.mlAwayOpen !== null ? odds(mv.mlAwayOpen) : null} now={mv.mlAwayNow !== null ? odds(mv.mlAwayNow) : null} />
            </dl>
          ) : (
            <p className="text-xs text-ink-2">No opening line available.</p>
          )}
          <p className="text-xs text-ink-3">Big moves usually mean sharp money or news. The fair line already reflects current prices.</p>
        </Card>
        <Card className="p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Cloud className="h-4 w-4 text-ink-3" aria-hidden />
            Conditions
          </p>
          {info.indoor ? (
            <p className="text-xs text-ink-2">Indoor venue. Weather does not matter here.</p>
          ) : info.weather ? (
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-ink-3">Temperature</dt>
                <dd className="text-sm tnum">{info.weather.tempF !== null ? `${Math.round(info.weather.tempF)}°F` : "-"}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Wind</dt>
                <dd className={cn("text-sm tnum", (info.weather.windMph ?? 0) >= 15 && "text-warn")}>
                  {info.weather.windMph !== null ? `${Math.round(info.weather.windMph)} mph` : "-"}
                  {info.weather.gustMph ? <span className="text-ink-3"> (gusts {Math.round(info.weather.gustMph)})</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Rain chance</dt>
                <dd className="text-sm tnum">{info.weather.precipPct !== null ? `${info.weather.precipPct}%` : "-"}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Sky</dt>
                <dd className="text-sm">{info.weather.summary ?? "-"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-ink-2">No forecast yet for this game.</p>
          )}
        </Card>
      </div>
      <Card className="p-4 mt-3">
        <div className="grid gap-6 md:grid-cols-2">
          <TeamColumn team={info.away} sport={sport} />
          <TeamColumn team={info.home} sport={sport} />
        </div>
      </Card>
    </section>
  );
}

function MoveRow({ label, open, now }: { label: string; open: string | null; now: string | null }) {
  const moved = open !== null && now !== null && open !== now;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tnum">
        {open ?? "-"} <span className="text-ink-3">to</span> <span className={moved ? "text-ink font-medium" : "text-ink-2"}>{now ?? "-"}</span>
      </dd>
    </div>
  );
}

function ProbBar({ left, right, leftP, rightP }: { left: string; right: string; leftP: number; rightP: number }) {
  const total = leftP + rightP || 1;
  const l = (leftP / total) * 100;
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden gap-[2px]">
        <div className="bg-series-2 rounded-l-full" style={{ width: `${l}%` }} />
        <div className="bg-series-1 rounded-r-full flex-1" />
      </div>
      <div className="flex justify-between text-xs mt-1 tnum">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-series-2" aria-hidden />
          {left} {(leftP * 100).toFixed(1)}%
        </span>
        <span className="flex items-center gap-1.5">
          {right} {(rightP * 100).toFixed(1)}%
          <span className="inline-block h-2 w-2 rounded-sm bg-series-1" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function PropsPanel({ sport, eventId, mode }: { sport: string; eventId: string; mode: "live" | "demo" }) {
  const settings = useSettings();
  const [requested, setRequested] = useState(false);
  const cfg = getSport(sport);
  const url = requested ? `/api/props?sport=${encodeURIComponent(sport)}&eventId=${encodeURIComponent(eventId)}&${analysisQuery(settings)}` : null;
  const { data, error, loading } = useApi<PropsResponse>(url, 10 * 60 * 1000);
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const legs = useMemo(() => (data?.legs ?? []).filter((l) => marketFilter === "all" || l.market === marketFilter), [data, marketFilter]);
  const markets = cfg?.props ?? [];
  return (
    <section>
      <SectionTitle
        title="Player props"
        subtitle="FanDuel prop prices against other books, plus each player's real game log from ESPN."
        right={
          !requested ? (
            <Button variant="primary" onClick={() => setRequested(true)}>
              <Users className="h-4 w-4" aria-hidden />
              Load player props
            </Button>
          ) : null
        }
      />
      {!requested ? (
        <Card className="p-4 text-sm text-ink-2">
          {mode === "live"
            ? `Loading props pulls ${markets.length} prop markets for this one game, which costs up to ${markets.length} Odds API credits. Results are cached.`
            : "Demo props use real players and their real game logs, with simulated prices."}
        </Card>
      ) : error && !data ? (
        <Empty title="Could not load props">{error}</Empty>
      ) : loading && !data ? (
        <Card className="p-6">
          <Spinner label="Pulling prop prices and player game logs..." />
        </Card>
      ) : data && !data.legs.length ? (
        <Empty title="No props yet">{data.warnings.join(" ") || "FanDuel has not posted props for this game."}</Empty>
      ) : data ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[{ key: "all", label: "All" }, ...markets.filter((m) => data.legs.some((l) => l.market === m.key))].map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMarketFilter(m.key)}
                className={cn("rounded-full border px-3 py-1 text-xs", marketFilter === m.key ? "border-accent bg-accent-bg text-ink" : "border-line-2 text-ink-2 hover:text-ink")}
              >
                {m.label}
              </button>
            ))}
          </div>
          {legs.slice(0, 120).map((l) => (
            <PropRow key={l.id} leg={l} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PropRow({ leg }: { leg: AnalyzedLeg }) {
  const inSlip = useInSlip();
  const odds = useOdds();
  const [open, setOpen] = useState(false);
  const selected = inSlip(leg.id);
  const stats = leg.propStats;
  const def = getSport(leg.sport)?.props.find((p) => p.key === leg.market);
  return (
    <Card className={cn("p-3", selected && "border-accent")}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,0.8fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{leg.label}</p>
          <p className="text-xs text-ink-3 truncate">
            {stats ? `Avg ${stats.avg.toFixed(1)}${stats.l5Avg !== null ? ` · last 5 ${stats.l5Avg.toFixed(1)}` : ""} · ${stats.sample} games` : "No game log match"}
            {leg.consensus.oneSided ? " · one-sided market" : ""}
          </p>
        </div>
        {stats ? <HitChart values={stats.values} dates={stats.dates} line={def?.yesNo ? 0.5 : (leg.point ?? 0)} unit={def?.label ?? ""} /> : <div />}
        <div className="flex items-center gap-3 sm:block">
          <p className="text-sm font-semibold tnum">{odds(leg.fd.american)}</p>
          <EvBadge ev={leg.ev} />
          <div className="sm:mt-1">
            <ConfidenceMeter value={leg.confidence} compact />
          </div>
        </div>
        <div className="flex items-center gap-1.5 justify-self-end">
          <Button size="sm" variant={selected ? "primary" : "secondary"} onClick={() => toggleLeg(leg)}>
            {selected ? "In slip" : "Add"}
          </Button>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Show details" className="rounded-md p-1 text-ink-2 hover:bg-surface-2">
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      </div>
      {open ? (
        <div className="mt-3 border-t border-line pt-3 grid gap-4 md:grid-cols-2">
          <SignalList signals={leg.signals} />
          <div className="flex flex-wrap gap-1.5 content-start">
            {leg.quotes.map((qt) => (
              <span key={qt.book} className={cn("rounded-md border px-2 py-1 text-xs tnum", qt.book === "fanduel" ? "border-accent text-ink" : "border-line-2 text-ink-2")}>
                {bookInfo(qt.book).title} <span className="text-ink">{odds(qt.american)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
