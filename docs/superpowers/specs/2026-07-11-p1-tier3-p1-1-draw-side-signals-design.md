# P1 Tier 3, P1-1: Draw-Side Signals

**Date:** 2026-07-11
**Status:** Approved

## Problem

The signal engine only ever evaluates home and away odds movement.
`drawOdds` already exists on `OddsSnapshot` and already flows through
`logic/marketMaker.ts` (`fairOdds`/`bidOdds`/`askOdds` are already
`{ home, away, draw }` objects) — the data is real and already used
elsewhere, just never fed into signal generation, settlement, or
Arena. This item wires the draw market into the full existing 1X2
pipeline: signal generation, settlement, steam detection, and Arena.

First item in the user's full remaining-PDF-list rollout (P1-1, P1-7,
P1-16, revisiting P1-4/P1-5/P1-8/P1-19, the 20 mandatory tests, the
15-item Definition of Done), each gated individually — this spec
covers P1-1 only.

## `TeamSide` widening

`types.ts`: `export type TeamSide = "home" | "away" | "draw";`. This
is the single source-of-truth change that ripples through every
consumer below.

## `signalEngine.ts` — 3-way compression comparison

`buildSignalFromSnapshots` currently:

```typescript
const side: TeamSide = homeCompression >= awayCompression ? "home" : "away";
const bestChangePct = side === "home" ? homeCompression : awayCompression;
```

Extends to a 3-way max including `drawCompression` (computed via the
already-generic `calculateCompressionPct(previous.drawOdds,
current.drawOdds)`), picking whichever of the three sides compressed
most. `target`/`oddsBefore`/`oddsAfter` selection extends the same
way (`target = "Draw"` when `side === "draw"`, `oddsBefore`/`oddsAfter`
read from `drawOdds`). Severity, `momentumScore`, `confidenceScore`
(including the P1-2 longshot penalty), and explanation-building are
already side-agnostic — no change needed there beyond passing through
whichever side won.

## `store.ts` — settlement

`evaluatePendingSignalsForFinishedMatches`'s non-totals branch:

```typescript
const homeWon = match.homeScore > match.awayScore;
const awayWon = match.awayScore > match.homeScore;
signalWon =
  (signal.side === "home" && homeWon) || (signal.side === "away" && awayWon);
```

Gains a third clause: `|| (signal.side === "draw" && match.homeScore
=== match.awayScore)`.

## `steamDetection.ts` — extend to draw

`oddsForSide`'s home/away ternary becomes a 3-way lookup including
`drawOdds`. `detectSteamMove` (currently `findSteamForSide(sorted,
"home") ?? findSteamForSide(sorted, "away")`) checks all three sides
in the same "most recent run wins" precedence. Approved as in-scope by
the user — `oddsForSide` was already simple/generic enough that this
is a small, natural addition given `TeamSide` is being widened anyway.

## `marketConfirmation.ts` — no logic change

`previousQuote.bidOdds[signal.side]` and `askOdds[signal.side]` are
already `{ home, away, draw }` object lookups, not ternaries — they
resolve correctly automatically once `TeamSide` includes `"draw"`. No
code change needed in this file, confirmed by inspection.

## `arena.ts` — Contrarian skips draw signals

`buildMomentumFollowerPosition` and `buildKellyCriterionPosition` need
no change — both already read `signal.side`/`target`/`oddsAfter`/
`confidenceScore` generically with no home/away-specific branching.

`buildContrarianPosition`'s `opposingSide` computation
(`signal.side === "home" ? "away" : "home"`) has no principled
"opposite" for a draw signal in a 3-outcome market without inventing a
probability heuristic — **user-approved decision: Contrarian does not
trade draw signals at all**, treated exactly like the existing
`isTotalsSignal` exclusion. `getRejectionReason` (from P1-6) gains a
new case:

```typescript
export type RejectionReason =
  | "totals_signal"
  | "not_market_only_move"
  | "no_original_snapshot"
  | "draw_signal";
```

Checked immediately after the existing `isTotalsSignal` check, before
the `agentId !== "contrarian"` early return (so it only applies to
Contrarian, matching how `not_market_only_move`/`no_original_snapshot`
are already Contrarian-only). `buildContrarianPosition` itself gains
a matching early return: `if (signal.side === "draw") return null;`.

## Frontend — type widening only

`side: "home" | "away"` literal types widen to include `"draw"` across
the ~8 files that reference it (`App.tsx`, `ArenaPanel.tsx`,
`SignalIntelligencePanel.tsx`, `SignalArchivePanel.tsx`,
`SteamMoveDetectionPanel.tsx`, `SignalCorrelationPanel.tsx`,
`pinnedCaseStudies.ts`, `api.ts`). Confirmed by grep: no
`side === "home" ? X : Y` binary ternary exists anywhere in
`apps/web/src` — every current rendering of `side`/`target` is a raw
string/template-literal display (e.g. Arena's `"{match} → {target}"`,
correlation's `"{side} · {severity} · {market}"`), so `"draw"`/`"Draw"`
renders correctly automatically once the types compile. The
pre-existing "Market pressure" home/away bar in `App.tsx`
(`selectedMatchMarketPressure`) is a separate, private
momentum-weighted heuristic entirely unrelated to `AgentSignal.side` —
confirmed out of scope, not touched.

## Testing

- `signalEngine.test.ts`: a case where `drawOdds` compresses more than
  home/away, confirming `side === "draw"`, `target === "Draw"`.
- `store.test.ts`: settlement correctness for a `"draw"` signal against
  a real drawn final score, and against a non-drawn score (incorrect).
- `steamDetection.test.ts`: a sustained draw-odds move is detected the
  same way home/away moves already are.
- `arena.test.ts`: `getRejectionReason("contrarian", drawSignal, ...)`
  returns the new `"draw_signal"` reason; `buildContrarianPosition`
  returns `null` for a draw signal; `buildMomentumFollowerPosition`/
  `buildKellyCriterionPosition` correctly build a position for a draw
  signal (regression check that generic side-handling truly holds).

## Out of scope

- The `App.tsx` "Market pressure" bar — separate pre-existing feature,
  confirmed unrelated to signal `side`.
- Any other remaining rollout item (P1-7, P1-16, P1-4/P1-5/P1-8/P1-19,
  mandatory tests, Definition of Done) — each gated individually per
  the user's explicit sequencing.
