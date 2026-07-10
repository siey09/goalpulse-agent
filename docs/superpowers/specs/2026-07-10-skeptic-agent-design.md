# Skeptic Agent (Read-Only Critique Layer) Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

The last of the four "future ideas" candidates recorded 2026-07-10
(`PROJECT_STATE.md`), originally framed as "a 4th Arena agent that
audits/critiques the other agents' reliability rather than trading the
feed itself." The Meta-agent recommendation (shipped earlier
2026-07-10) already fixed the ROI-fairness and minimum-sample-size bias
in Arena's leader claim, but never checked whether the declared leader's
settled positions are actually diversified across real matches — a
separate, still-open reliability question, not a duplicate of that
earlier fix.

**Real finding, checked before designing this (not hypothetical):** live
production data shows the Meta-agent's current declared leader (Kelly
Criterion) has **100% of its 17 settled positions from a single real
match** (fixture `18209181`). This is the exact concentration-bias
pattern already found and fixed three times this session (Signal
Performance's `distinctMatchCount`, Signal Correlation's dedup, and the
Meta-agent recommendation's own ROI/sample-size fix) — just not yet
applied to Arena's match-diversity dimension specifically.

## Read-only critique layer, not a 4th tracked agent

**Decision (user-confirmed):** this is not built as a 4th Arena agent
wired into the existing `ArenaPosition`/`ArenaScoreboard`
settlement/ledger system. A Skeptic Agent never trades — it has no
side, no stake, no P&L — so it has no natural fit in a data model built
specifically to track stakes and settlement outcomes. Forcing it in
would mean inventing fake positions to satisfy a structure that doesn't
apply to it: an architectural mismatch, not just added risk. Instead,
it's a pure, read-only function computed over the exact same
`GET /api/arena` response the Meta-agent recommendation already
consumes — zero backend changes, zero touch to Arena's settlement code.

## What it critiques

Given whichever agent the Meta-agent recommendation currently names as
leader (`recommendation.agentId`), compute that agent's settled-position
match diversity — the same `distinctMatchCount`/`largestMatchSharePct`
pattern already proven in `apps/api/src/logic/signalPerformance.ts`,
including the same `baseMatchId` collapsing for totals-suffix matchIds
(`<fixtureId>-totals-<line>`).

**Flag threshold: the largest single real match accounts for ≥50% of
the leader's settled positions.** When flagged, state plainly that the
lead is provisional until it settles across more matches. When not
flagged, state the diversification plainly too — matching this
project's established pattern of confirming good news, not just
surfacing alarms (Signal Performance shows SHARP_MOVE's real 33% rather
than hiding it; this critique should be equally willing to say "this
lead looks solid" when the data actually supports that).

If the Meta-agent recommendation has no leader yet (not enough settled
positions across agents), or the leader itself has zero settled
positions, there is nothing to critique — render nothing.

```typescript
const CONCENTRATION_WARNING_THRESHOLD_PCT = 50;

function getSkepticCritique(
  recommendation: MetaAgentRecommendation,
  arena: ArenaResponse | null
): string | null {
  if (!recommendation.agentId || !arena) return null;

  const leaderScoreboard =
    recommendation.agentId === "momentum_follower"
      ? arena.momentumFollower
      : recommendation.agentId === "contrarian"
        ? arena.contrarian
        : arena.kellyCriterion;

  const settled = leaderScoreboard.positions.filter((p) => p.resultStatus !== "pending");
  if (settled.length === 0) return null;

  const matchCounts = new Map<string, number>();
  for (const position of settled) {
    const base = baseMatchId(position.matchId);
    matchCounts.set(base, (matchCounts.get(base) ?? 0) + 1);
  }

  const distinctMatchCount = matchCounts.size;
  const largestMatchCount = Math.max(...matchCounts.values());
  const largestMatchSharePct = Math.round((largestMatchCount / settled.length) * 100);
  const matchWord = distinctMatchCount === 1 ? "match" : "matches";

  if (largestMatchSharePct >= CONCENTRATION_WARNING_THRESHOLD_PCT) {
    return `Skeptic check: ${leaderScoreboard.label}'s lead is concentrated — ${largestMatchSharePct}% of its ${settled.length} settled positions come from a single real match (${distinctMatchCount} distinct ${matchWord} total). Treat the lead as provisional until it settles across more matches.`;
  }

  return `Skeptic check: ${leaderScoreboard.label}'s lead is diversified across ${distinctMatchCount} distinct real matches (largest single match is ${largestMatchSharePct}% of its ${settled.length} settled positions) — not an artifact of one match's outcome.`;
}
```

`positions` on `ArenaScoreboard` already holds every position (settled
and open, confirmed against live data: `positions.length` exactly equals
`settledCount + openPositions`), not a display-truncated slice — no new
field needed from the API.

`baseMatchId` is a small local helper, mirroring the identical function
already used in `SignalCorrelationPanel.tsx`:

```typescript
function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}
```

## Where it surfaces

Directly below the Meta-agent recommendation callout added earlier
2026-07-10, same file (`ArenaPanel.tsx`), same visual section — before
the three `ScoreboardCard`s. Reads as one continuous thought: "here's
who's leading" (Meta-agent recommendation) → "here's whether you should
trust that" (Skeptic critique) → then the detailed per-agent scoreboards
below.

```tsx
{skepticMessage && (
  <div className="mb-4 rounded-2xl border border-rose-400/15 bg-rose-400/5 p-4">
    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
      <ShieldQuestion className="h-4 w-4" />
      Skeptic check
    </div>
    <p className="text-sm leading-6 text-stone-200">{skepticMessage}</p>
  </div>
)}
```

Rose accent (distinct from the Meta-agent callout's amber) so the two
read as visually separate claims even though they're stacked — one new
icon import, `ShieldQuestion` from `lucide-react` (already a dependency,
no new package).

## Testing

No frontend test runner exists in `apps/web`. Verified via clean
`npm run build` and a manual dev-browser check against live production
data: confirm the critique correctly flags Kelly Criterion's current
100%-single-match concentration with the "treat as provisional" phrasing,
and confirm no console errors. Per the session's process: merge only
after user review, then verify live in production — including
re-checking that the message would flip to the honest "diversified"
phrasing if match diversity changes by verification time.

## Out of scope (explicitly deferred)

- No 4th Arena agent, no ledger/position-tracking, no touch to
  settlement code (see decision above).
- No backend change — `matchId` is already on every position in the
  existing `GET /api/arena` response.
- No critique of agents *other than* the currently-declared leader —
  this audits the specific claim the Meta-agent recommendation is
  making, not a general-purpose reliability score for all three agents.
- No new critique dimensions beyond match concentration (e.g., time
  clustering, odds-range concentration) — match concentration is the
  exact bias class already proven three times this session; other
  dimensions are unproven speculation for a feature explicitly scoped
  to be as small and safe as possible this close to the deadline.
