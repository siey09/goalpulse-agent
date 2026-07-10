# Meta-Agent Recommendation Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

`ArenaPanel.tsx` already has a per-card "Leading" trophy badge
(`leaderAgentId`, `ArenaPanel.tsx:205-211`), but it picks the leader by
raw `netUnits` with zero sample-size awareness — the
same class of bias already found and fixed twice this session (Signal
Performance's match-concentration, Signal Correlation's dedup). Raw net
units also isn't a fair comparison across these three agents in the
first place: Momentum Follower and Contrarian always stake a flat 1
unit, while Kelly Criterion sizes its stake by a confidence-derived
edge — a bigger net-units number from Kelly could just mean it staked
more, not that it performed better per unit risked.

This is the third of the four "future ideas" candidates recorded
2026-07-10 (`PROJECT_STATE.md`), now being built: a small, honest,
read-only computation over data `GET /api/arena` already returns —
`settledCount`, `netUnits`, `roiPercent`, `winRatePct`, `openPositions`
per agent, nothing new needed from the backend.

## Ranking methodology

**Metric: ROI% (`roiPercent`), not raw `netUnits`.** ROI is net units
divided by total staked, which normalizes across the three agents'
different stake sizing — the one fair like-for-like comparison already
computed server-side.

**Minimum sample size: 5 settled positions.** Calibrated against real
live production data checked during brainstorming: Momentum Follower and
Kelly Criterion both currently have 17 settled positions, Contrarian has
0. A threshold of 5 lets the two agents with real data be compared while
correctly excluding an agent that hasn't settled anything yet — too low
to perpetually stall, too high to be reached by 1-2 lucky/unlucky bets.

**Comparison requires at least 2 qualifying agents.** If fewer than 2
agents have `settledCount >= 5`, there's nothing to fairly compare —
show the honest fallback message instead of declaring a leader from a
single agent's numbers in isolation.

**Narrow-margin hedge: <10 percentage points of ROI.** Calibrated
against real live data: the two currently-qualifying agents are 5.2
points apart (-88.77% vs -94%). A gap that small gets phrased as "a
narrow lead... worth revisiting" rather than "a clear lead" — the
recommendation should read differently depending on how decisive the
gap actually is.

**Honesty holds even when the leader is net-negative.** Real current
data: Kelly Criterion would lead at -88.77% ROI vs Momentum Follower's
-94% — both are losing. The message states the real number plainly, it
does not spin a "leader" among two losing strategies into sounding like
a win.

## Where it surfaces

A new callout inside the existing `ArenaPanel.tsx`, placed after the
intro paragraph and before the three `ScoreboardCard`s — the synthesized
takeaway first, supporting per-agent detail below. **The existing
trophy badge is fixed in place, not duplicated**: `leaderAgentId`'s
naive `netUnits`-tie logic is replaced by the same
`getMetaAgentRecommendation()` result used for the new callout, so the
per-card badge and the callout can never disagree with each other.

## Computation

Entirely client-side in `ArenaPanel.tsx`, derived from the `arena` state
already fetched every 5s by the panel's existing poll — no backend
change, no new fetch.

```typescript
const MIN_SETTLED_FOR_RANKING = 5;
const NARROW_MARGIN_THRESHOLD_PCT = 10;

const STRATEGY_MECHANISM: Record<ArenaAgentId, string> = {
  momentum_follower: "takes every signal at face value",
  contrarian: "fades signals that fire without real field support",
  kelly_criterion: "sizes stakes by the model's own confidence score instead of betting flat",
};

type MetaAgentRecommendation = {
  agentId: ArenaAgentId | null;
  message: string;
};

function formatRoi(value: number) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function getMetaAgentRecommendation(arena: ArenaResponse | null): MetaAgentRecommendation {
  if (!arena) {
    return { agentId: null, message: "Waiting for arena data." };
  }

  const scoreboards = [arena.momentumFollower, arena.contrarian, arena.kellyCriterion];
  const qualifying = scoreboards.filter((s) => s.settledCount >= MIN_SETTLED_FOR_RANKING);

  if (qualifying.length < 2) {
    return {
      agentId: null,
      message: "Not enough settled positions yet to recommend a leading strategy.",
    };
  }

  const sorted = [...qualifying].sort((a, b) => b.roiPercent - a.roiPercent);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const margin = leader.roiPercent - runnerUp.roiPercent;
  const isNarrow = margin < NARROW_MARGIN_THRESHOLD_PCT;

  const marginText = isNarrow
    ? `a narrow lead over ${runnerUp.label} (${formatRoi(runnerUp.roiPercent)}) — worth revisiting as more signals settle`
    : `a clear lead over ${runnerUp.label} (${formatRoi(runnerUp.roiPercent)})`;

  return {
    agentId: leader.agentId,
    message: `${leader.label} currently leads on ROI at ${formatRoi(leader.roiPercent)} over ${leader.settledCount} settled positions — ${marginText}. It ${STRATEGY_MECHANISM[leader.agentId]}.`,
  };
}
```

Called once per render as `getMetaAgentRecommendation(arena)`; its
`agentId` field replaces the existing `leaderAgentId` IIFE for the
`isLeader` prop on all three `ScoreboardCard`s, and its `message` field
is the callout's only dynamic content — one code path handles both the
leader-found and honest-fallback cases, no branching JSX structure.

## UI

```tsx
<div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4">
  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
    <Trophy className="h-4 w-4" />
    Meta-agent recommendation
  </div>
  <p className="text-sm leading-6 text-stone-200">{recommendation.message}</p>
</div>
```

Reuses the already-imported `Trophy` icon (no new import) and the
panel's existing amber accent color (matching the trophy badge's own
`border-amber-400/30 bg-amber-400/10 text-amber-200` palette), placed
immediately before the `<div className="grid gap-4 lg:grid-cols-3">`
scoreboard grid.

## Testing

No frontend test runner exists in `apps/web`. Verified via clean
`npm run build` and a manual dev-browser check against live production
data: confirm the callout and the fixed trophy badge name the same
agent, confirm the honest "not enough settled positions" message renders
given Contrarian's current 0 settled count (fewer than 2 qualifying
agents right now, so the fallback message should show, not a
comparison), and confirm the narrow-margin hedge phrasing appears given
the real ~5-point gap between Momentum Follower and Kelly Criterion. Per
the session's process: merge only after user review, then verify live in
production.

## Out of scope (explicitly deferred)

- No backend change — all fields already exist on `GET /api/arena`.
- No new agent, no change to Arena's actual strategies or settlement
  logic — purely a read-only recommendation layer.
- No persistence/history of past recommendations — recomputed fresh
  from live state every poll, matching every other derived-on-render
  computation in this app.
- No change to Contrarian's 0-settled-position state itself — that's
  real current tournament data, not something this feature touches or
  needs to explain beyond the honest fallback message.
