# Arena Kelly-Criterion Agent Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

Arena currently runs two synthetic agents (Momentum Follower, Contrarian),
both flat 1-unit stakers — they differ in *which side* they take, never in
*how much* they stake. A third agent should differ in mechanism, not just
threshold tuning. With `confidenceScore` now on every signal (item #7,
this session), variable position sizing driven by that field is the
genuinely distinct mechanism — confirmed with the user over Sharp-Only
(a filter on the same flat-staking mechanism the other two already use).

## Deriving an implied edge from `confidenceScore`

`confidenceScore` (0-100) is a composite quality measure, not a literal
win probability — using it as one directly would be a category error. This
spec derives an edge over the market's own implied probability instead:

- `marketImpliedProb = 1 / oddsTaken` — the market's own estimate.
- `edgeFraction = (confidenceScore / 100) * MAX_EDGE`, where
  `MAX_EDGE = 0.15` — a deliberately conservative cap (15 percentage
  points at full confidence). Nothing in this system has been backtested
  to justify assuming a larger edge than this.
- `ourProbEstimate = clamp(marketImpliedProb + edgeFraction, 0, 1)`.

## Kelly fraction and stake sizing

Standard Kelly formula: `f* = (b·p − q) / b`, where `b = oddsTaken − 1`
(net odds), `p = ourProbEstimate`, `q = 1 − p`.

**Verified algebraically:** at `confidenceScore = 0` (`edgeFraction = 0`,
so `p = marketImpliedProb` exactly), `f*` evaluates to exactly `0` for
*any* odds value — substituting `p = 1/oddsTaken` into the formula, `b·p`
always exactly cancels `q`. This means a zero-confidence signal always
stakes nothing, matching real Kelly's "no edge, no bet" behavior exactly
at the boundary — not an approximation, an exact algebraic property of
this formula.

`f*` is capped at `MAX_STAKE_FRACTION = 0.2` (full Kelly can recommend
unrealistically large fractions on strong assumed edges/short odds; this
cap is a deliberate conservatism), then scaled by
`KELLY_BANKROLL_UNITS = 10` so stakes land in a range comparable to the
other agents' flat 1-unit bets (0 to 2 units). `oddsTaken <= 1` is guarded
explicitly (returns a 0 stake) to avoid dividing by `b = 0`.

## Schema change: `ArenaPosition.stakeUnits`

Affects all three agents, not just the new one. `ArenaPosition` gains
`stakeUnits: number`. Momentum Follower and Contrarian always report `1`
(their existing flat-stake behavior, now made explicit rather than
implicit). This is necessary for `roiPercent` to stay mathematically
correct: the existing formula divides net profit by
`settledCount × UNIT_STAKE`, silently assuming every position risked
exactly 1 unit — wrong once a variable-stake agent exists. `summarize()`
is updated to divide by the *sum of actual stakes risked* instead.

**This refactor is 100% behavior-preserving for the existing two agents:**
since their `stakeUnits` is always exactly `1`, `sum(stakeUnits)` across
`settledCount` positions equals `settledCount × 1`, identical to the
current formula's result. No change to Momentum Follower/Contrarian's
existing, already-tested `roiPercent` values.

## A `-0` correctness detail found during design

The existing `settleUnit(resultStatus, oddsTaken)` returns `-UNIT_STAKE`
on an incorrect result — since `UNIT_STAKE` is always exactly `1`, this
never produces JavaScript's negative zero. Once stakes can legitimately be
`0` (a zero-edge Kelly signal), the equivalent `-stakeUnits` expression
*would* produce `-0` for a `0`-stake incorrect position. `-0 === 0` is
`true`, but Vitest's `toBe()` uses `Object.is()`, under which
`Object.is(-0, 0)` is `false` — a real, if obscure, test-flakiness risk.
Fixed by writing the negation as `0 - stakeUnits` instead of `-stakeUnits`
(the former always produces `+0` when `stakeUnits` is `0`; the latter
produces `-0`), in the new generalized `settleStake` function that
replaces `settleUnit`.

## Implementation

`apps/api/src/types.ts`:
- `ArenaAgentId` gains `"kelly_criterion"`.
- `ArenaPosition` gains `stakeUnits: number`.

`apps/api/src/logic/arena.ts`:
- `settleUnit(resultStatus, oddsTaken)` → generalized to
  `settleStake(resultStatus, oddsTaken, stakeUnits)`, used by all three
  agents (`buildMomentumFollowerPosition`/`buildContrarianPosition` now
  pass `UNIT_STAKE` explicitly instead of relying on a hardcoded internal
  constant).
- New `calculateKellyStake(oddsTaken: number, confidenceScore: number): number`
  — pure, implements the formula above.
- New `buildKellyCriterionPosition(signal: AgentSignal): ArenaPosition | null`
  — excludes totals signals (`isTotalsSignal`), matching the existing
  convention *within Arena specifically* (unlike steam
  detection/correlation/market-confirmation, which deliberately include
  totals — those are separate features with their own precedents; this
  new agent lives inside Arena and should match Arena's own existing
  in-family convention). Takes the *same side* as the original signal (a
  sizing strategy, not a direction strategy). `signal.confidenceScore ?? 0`
  — a signal somehow missing the field (shouldn't happen given item #7,
  but the field is typed optional) is treated as zero edge, staking
  nothing, not a crash.
- `summarize()` updated: `roiPercent` divides by `sum(stakeUnits)` across
  settled positions instead of `settledCount * UNIT_STAKE`.
- `computeArenaScoreboards()` returns a third scoreboard,
  `kellyCriterion`, alongside the existing two.

`apps/api/src/server.ts`'s `/api/arena` route: destructures the third
scoreboard, includes its `positions` in the SHA-256 proof hash input
(now three ledgers instead of two), includes `kellyCriterion` in the
response, and updates the proof `note` text to mention three agents.

## Response shape (illustrative addition to the existing `/api/arena` response)

```json
{
  "data": {
    "momentumFollower": { "...": "unchanged shape, now includes stakeUnits: 1 per position" },
    "contrarian": { "...": "unchanged shape, now includes stakeUnits: 1 per position" },
    "kellyCriterion": {
      "agentId": "kelly_criterion",
      "label": "Kelly Criterion",
      "positions": [
        { "agentId": "kelly_criterion", "signalId": "...", "side": "home", "oddsTaken": 2.0, "stakeUnits": 1.5, "resultStatus": "correct", "profitUnits": 1.5 }
      ],
      "settledCount": 1, "correctCount": 1, "incorrectCount": 0,
      "winRatePct": 100, "netUnits": 1.5, "roiPercent": 100, "openPositions": 0
    },
    "proof": { "type": "sha256", "hash": "...", "verifiableStat": null, "note": "Tamper-evident SHA-256 hash of all three agents' full position ledgers..." }
  }
}
```

## Testing

- `calculateKellyStake`: zero confidence stakes exactly 0 at an arbitrary
  odds value (verifying the algebraic property generally, not tied to one
  "nice" odds value); a mid-range confidence produces an uncapped stake
  with a hand-verified exact value; a high-confidence/short-odds
  combination hits the `MAX_STAKE_FRACTION` cap; `oddsTaken <= 1` returns
  0 without dividing by zero.
- `buildKellyCriterionPosition`: correct/incorrect/pending settlement
  using the computed stake; totals signals excluded; missing
  `confidenceScore` treated as zero edge (stakes nothing); a dedicated
  `toBe(0)` (not `toBeCloseTo`) assertion on an incorrect, zero-stake
  position's `profitUnits`, specifically verifying the `-0`-avoidance fix.
- `summarize()`/`computeArenaScoreboards()`: existing Momentum
  Follower/Contrarian ROI values are unchanged (regression-checked against
  the pre-existing test fixtures) now that the denominator is
  stake-summed rather than count-based; Kelly's ROI is correctly computed
  from its own variable stakes.

## Docs

`openapi.yaml`'s `/api/arena` response schema gains `kellyCriterion` (same
shape as `ArenaScoreboard`) and `stakeUnits` on the shared position schema.

## Out of scope (explicitly deferred)

- No dashboard panel changes — backend-only, matching the established
  pattern (the existing `ArenaPanel.tsx` is frontend/judge-facing polish,
  explicitly out of scope for this queue per the user's original
  instruction).
- No backtesting of `MAX_EDGE`/`MAX_STAKE_FRACTION` against real
  historical outcomes — these are principled but ultimately judgment-call
  constants, not empirically derived; revisiting them with real data is a
  natural fit for item #9 (retroactive backtesting against the archive),
  not this spec.
- No change to Momentum Follower's or Contrarian's side-selection logic —
  only their stake representation becomes explicit (`stakeUnits: 1`)
  rather than implicit.
