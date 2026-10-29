# ParlayLab

A betting research app for FanDuel. It checks every FanDuel price against sharper books, layers on a bunch of free info (injuries, form, rest, weather, line movement, ESPN's matchup model, player game logs), and builds parlays that actually have an edge. When you like a parlay, one tap opens it in your FanDuel betslip.

## What it does

- **Odds board**: every FanDuel moneyline, spread and total with its no-vig fair price, EV and a confidence score. Tap any price to add it to your slip.
- **Sharp fair odds**: pulls up to 10 books, removes the vig from each (power, Shin, multiplicative or additive), and weights Pinnacle, BetOnline and LowVig heaviest. Different lines get moved onto FanDuel's line.
- **Info layer**: ESPN matchup predictor, point differential, last 5 games, rest and back-to-backs, injury reports with key absences flagged, wind and rain at kickoff (Open-Meteo), and line movement since open. It feeds a small, capped adjustment to the market price and shows up as readable reasons on every bet.
- **Player props**: FanDuel prop prices against other books, plus each player's real ESPN game log with a hit-rate chart against the line.
- **Parlay builder**: exact parlay odds, fair odds, hit chance, EV and a Kelly stake. Same game legs get a correlation model, and you can type in FanDuel's SGP price to see if it is still +EV. Profit boosts are supported.
- **Auto-optimizer**: searches thousands of combinations of +EV legs from different games and ranks them for long-run bankroll growth (or max EV, hit chance, or edge per unit of risk).
- **FanDuel deep links**: one tap loads the whole parlay into your FanDuel betslip.
- **Bet tracker**: log bets, grade them from final scores automatically, and compare actual profit to expected profit over time.

## Quick start

```bash
npm install
cp .env.example .env.local   # then paste your key into ODDS_API_KEY
npm run dev
```

Open http://localhost:3000.

**No key yet?** It still runs in demo mode. Schedules, injuries, stats, weather, ESPN's predictor and player game logs are all real, DraftKings lines come from ESPN, and the other books' prices (FanDuel included) are simulated around them. Good for poking around, not for betting. Betslip links need a real key.

Get a free key at [the-odds-api.com](https://the-odds-api.com/#get-access). The free plan is 500 credits a month.

## Credits math

| Action | Cost |
| --- | --- |
| Refresh one sport's board (moneyline + spread + total across 10 books) | about 3 credits |
| Load props for one game | 1 credit per prop market with data (4 to 6) |
| Schedules, injuries, stats, weather, scores | free (ESPN, Open-Meteo) |

Odds are cached for `ODDS_CACHE_SECONDS` (10 minutes by default), and nothing refreshes on its own, so normal use on the free plan is fine. The remaining credit count shows on the board.

## How the edge works

1. **Fair odds** come from the books that take sharp action, with the vig stripped out. FanDuel is left out of its own fair price.
2. **EV** = fair probability x FanDuel payout - 1. Positive means FanDuel is overpaying.
3. **Info** can move the market probability by at most 3 points at the default weight (4.5 on player props). Liquid markets already know about the injury report, so a stats model that disagrees by a mile is usually the one that is wrong. Tune it (or turn it off) in Settings.
4. **Parlays** compound edges, good or bad. Three -110 legs at a true 50% each are about -13% EV, three times worse than one bet. Three +3% legs are about +9.3%. The optimizer only builds from legs with real edges.
5. **Stakes** use quarter Kelly with a 3% cap per bet by default.

The How it works page in the app goes deeper.

## Pages

| Page | What it is for |
| --- | --- |
| Today | Best single bets and suggested parlays right now |
| Odds board | Every game, sportsbook style, with filters |
| Game page | Line shopping across books, matchup info, player props |
| Parlay builder | Your slip plus the auto-optimizer |
| Tracker | Logged bets, auto grading, profit vs expected profit |
| Settings | Bankroll, Kelly size, devig method, info weight, odds format |

## Config

| Env var | Default | Notes |
| --- | --- | --- |
| `ODDS_API_KEY` | none | Without it the app runs in demo mode |
| `ODDS_CACHE_SECONDS` | `600` | How long odds are reused before spending credits again |
| `ODDS_BOOKMAKERS` | 10 books | Comma separated Odds API bookmaker keys. Up to 10 keeps the cost at 1 region. FanDuel is always added |

## Scripts

```bash
npm run dev        # local dev server
npm run build      # production build
npm start          # serve the production build
npm test           # unit tests (odds math, parlays, grading, analysis)
npm run lint
npm run typecheck
```

## Deploying

Any Node host works (`npm run build && npm start`). On Vercel, import the repo and add `ODDS_API_KEY` as an environment variable. The odds cache lives in memory per server instance, so a serverless host may spend a few more credits than a single long-running server.

## Project layout

```
src/lib/odds/      pure math: conversions, devig, consensus, EV/Kelly, correlation, parlay pricing, optimizer
src/lib/server/    data: The Odds API, ESPN, Open-Meteo, demo prices, event matching, analysis
src/lib/client/    browser stores (slip, settings, bet log) and fetch hooks
src/app/           pages and API routes (/api/board, /api/game, /api/props, /api/results, /api/status)
src/components/    UI
```

## Fine print

This is a research tool, not a guarantee. Edges are small, they disappear fast, and sportsbooks limit accounts that win. Your bet log lives in your browser (export it from the Tracker to back it up). Not affiliated with FanDuel. 21+ and only where sports betting is legal. If gambling stops being fun, call or text 1-800-GAMBLER.
