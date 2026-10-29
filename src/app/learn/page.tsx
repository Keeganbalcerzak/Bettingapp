import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "How it works · ParlayLab" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-6 text-ink-2">{children}</div>
    </section>
  );
}

function Example({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-line-2 bg-bg/60 p-3 text-sm text-ink tnum">{children}</div>;
}

export default function LearnPage() {
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">How it works</h1>
        <p className="text-sm text-ink-2 mt-1">
          The short version: FanDuel builds a cut into every price. You only make money long term on bets where FanDuel&apos;s price is better than
          the real odds. ParlayLab finds those bets, then helps you combine them without giving the edge back.
        </p>
      </div>

      <Section title="1. Find the real odds">
        <p>
          Some books take huge bets from professionals and move their lines the moment smart money shows up. Pinnacle is the big one, and
          BetOnline/LowVig are close behind. Their prices are the best public estimate of the true odds. We pull up to 10 books, strip the vig out of
          each one (the &quot;no-vig&quot; or &quot;devig&quot; step), and average them with the sharp books weighted heaviest. FanDuel is left out of its own fair
          price.
        </p>
        <Example>
          Pinnacle: Bills -125 / Ravens +115. Implied 55.6% + 46.5% = 102.1%. Remove the extra 2.1% and the fair split is about 54.5% / 45.5%.
        </Example>
        <p>
          When FanDuel hangs a different spread or total than the other books (say -3.5 vs -3), we convert their probabilities onto FanDuel&apos;s
          line using the typical scoring spread for that sport, and flag it so you know.
        </p>
      </Section>

      <Section title="2. Layer on the info">
        <p>Then we look at everything else that might matter, all from free sources:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>ESPN&apos;s matchup predictor (FPI/BPI) when the league has one.</li>
          <li>Season point differential, scoring and allowed per game, regressed early in the season.</li>
          <li>Last 5 games with scores and margins, home and road records.</li>
          <li>Rest days, back-to-backs, short weeks and byes.</li>
          <li>Injury reports, with key absences flagged (QBs, goalies, team leaders).</li>
          <li>Wind and rain at kickoff for outdoor games. Wind over 15 mph is the weather factor that actually moves football totals.</li>
          <li>Line movement from open to now, which usually means sharp money or news.</li>
          <li>For player props, the player&apos;s real game log: average, last 5, and how often they cleared this exact line.</li>
        </ul>
        <p>
          This becomes a second opinion on each bet. It gets a modest vote (4 to 20 percent depending on how solid the inputs are) and can move the
          market price by at most 3 percentage points (4.5 on player props, where the market is softer). That cap is on purpose. A liquid betting market already knows about the injury report, so when
          a stats model disagrees with it by a mile, the model is usually the one that is wrong. You can turn this up, down or off in{" "}
          <Link className="text-[#8ab4ff] hover:underline" href="/settings">
            Settings
          </Link>
          .
        </p>
      </Section>

      <Section title="3. EV and confidence">
        <p>
          Expected value is how much you make per dollar on average if you made the same bet forever: probability times payout, minus your stake.
        </p>
        <Example>
          FanDuel pays +110 (2.10) on a side we make 50%. EV = 0.50 x 2.10 - 1 = +5%. At -110 (1.91) it would be 0.50 x 1.91 - 1 = -4.5%.
        </Example>
        <p>
          The confidence score (0 to 100) rolls up how much the evidence agrees: the market edge sets the base, and each signal (model, movement,
          injuries, form, rest, weather, hit rate) pushes it up or down. It is a ranking aid, not a probability. Every bet shows exactly which signals
          went into it.
        </p>
      </Section>

      <Section title="4. Parlays without the trap">
        <p>
          Parlays multiply the vig. Each -110 leg has about a 4.5% house edge, and stacking legs compounds it:
        </p>
        <Example>
          3 legs at -110, each a true 50%: pays +596, true odds +700, EV = 0.125 x 6.96 - 1 = -13%. Three times worse than a single bet.
        </Example>
        <p>
          The flip side is the reason to parlay at all: if every leg is +EV, the edges compound too. Three legs at +3% each make a parlay worth about
          +9.3%. That is why the builder only searches legs with real edges, keeps one leg per game, and ranks by long-run bankroll growth instead of
          payout size.
        </p>
        <p>
          <span className="text-ink">Profit boosts</span> are FanDuel&apos;s best gift. A 30% boost on a +600 parlay pays +780, which can turn a slightly
          -EV parlay into a strong +EV one. Enter the boost in the builder and the optimizer finds the legs that make it worth the most.
        </p>
        <p>
          <span className="text-ink">Same game parlays</span> are different because the legs are connected. A team covering -7 almost always means
          they won, so that combo is far likelier than the two legs multiplied. We model this with correlation estimates (exact for moneyline plus
          spread, rough for props) and show the fair price. FanDuel also adjusts SGP prices for correlation, so type in the price FanDuel shows and
          we will tell you if it is still +EV.
        </p>
      </Section>

      <Section title="5. Bet size">
        <p>
          The Kelly criterion says how much to bet for the fastest long-run growth given your edge. Full Kelly assumes perfect probabilities, which
          nobody has, so the default is quarter Kelly with a 3% cap per bet. On a typical +4% edge at even money that is about 1% of your bankroll.
          Long parlays get tiny stakes because they rarely hit, which is the math protecting you.
        </p>
      </Section>

      <Section title="6. Know if it is working">
        <p>
          Short-term results are mostly noise. A +5% EV parlay at +600 still loses about 85% of the time. Log your bets in the{" "}
          <Link className="text-[#8ab4ff] hover:underline" href="/tracker">
            tracker
          </Link>{" "}
          and compare actual profit to expected profit over a few hundred bets. If the two track each other, the edges are real.
        </p>
        <p>
          A few honest limits. Everything here is public information, so the market has usually priced it in. Edges are small and come and go fast,
          and sportsbooks limit accounts that win consistently. Demo mode uses simulated prices, so do not bet off demo numbers.
        </p>
        <p>Bet only what you can afford to lose. 21+. If gambling stops being fun, call or text 1-800-GAMBLER.</p>
      </Section>
    </div>
  );
}
