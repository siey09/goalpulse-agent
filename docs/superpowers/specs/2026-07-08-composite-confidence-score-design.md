# Composite Confidence/Reliability Scoring Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

Signal severity (LOW/MEDIUM/HIGH) is classified purely from raw odds-compression
magnitude (`getSeverity(bestChangePct)`). `momentumScore` already blends
compression, time pressure, score-change, field pressure, and a reliability
penalty — but nothing today factors in *how tight* the attached
`scoresContext` actually is (currently a binary pass/fail 60-second gate,
not a graduated measure), and nothing surfaces each signal type's own
historical hit-rate from settled outcomes.

## Architectural split (confirmed with user)

Field pressure and freshness-tightness are synchronous data already
available at signal-creation time — a pure function fits `signalEngine.ts`'s
existing convention exactly. Historical hit-rate requires querying the
Supabase archive (`services/archive.ts`), an async, network-dependent
operation. Baking that into `agent.ts`'s synchronous signal-creation loop
would introduce real latency/complexity into the one piece of core
pipeline code that's stayed fully synchronous and stable all session, and
can't be verified end-to-end in this dev environment (no live Supabase
credentials here).

**Decision:** split into two independent pieces:
1. A new **synchronous** `confidenceScore` field on `AgentSignal`, computed
   in `signalEngine.ts` from magnitude + field pressure + freshness
   tightness — zero risk to the tested signal-creation pipeline's timing.
2. A new **async**, archive-backed `GET /api/signal-performance` endpoint
   reporting historical hit-rate per signal type — matching every other
   Supabase-dependent feature this session (computed live at request time,
   separate from the core loop).

## Part 1: `confidenceScore` on `AgentSignal`

**Type change:** `confidenceScore?: number` (0-100), added as **optional**
— matching the existing precedent of `discordAlertStatus?:` on the same
interface (a field `agent.ts`/`signalEngine.ts` always sets in practice,
but typed optional so the 6 existing test files' local `makeSignal()`
fixtures, which construct `AgentSignal` objects directly and don't set
every field, don't need updating). Confirmed: none of those fixtures do
full-object equality checks (`toEqual` on the whole signal) — all
assertions are field-specific (`.severity`, `.signalType`, etc.) — so this
change is purely additive with zero risk of breaking existing tests.

**Formula**, computed by a new `calculateConfidenceScore` function
alongside the existing sibling `calculateMomentumScore` in
`signalEngine.ts`:

- **Magnitude component** (weight 0.5): `bestChangePct` normalized against
  15% — the same threshold that already defines HIGH severity in this
  codebase, so a compression at or above the existing HIGH bar scores full
  marks here too, rather than inventing a new unrelated reference point.
- **Field pressure component** (weight 0.3, only when `scoresContext` is
  present): `scoresContext.fieldPressureScore` normalized against 45 — the
  same `FIELD_PRESSURE_MAX` constant `marketMaker.ts` already uses,
  exported from there rather than duplicated as a second magic number.
- **Freshness tightness component** (weight 0.2, only when `scoresContext`
  is present): a new graduated measure — see below.
- **Weights are renormalized among only the available components.** When
  no `scoresContext` is attached at all, `confidenceScore` is the
  magnitude component alone (weight renormalized to 1.0), not a lower
  score dragged down by two missing components — matching this codebase's
  existing precedent of never penalizing "no data" the same as "bad data"
  (see `marketMaker.ts`'s `UNKNOWN` reliability handling).

**Freshness tightness** is a new function, `computeFreshnessTightness`,
added to the existing `logic/scoresContextFreshness.ts` (alongside
`isScoresContextFresh`, since both operate on the same tick-timestamp vs.
context-timestamp gap and the same `SCORES_CONTEXT_TOLERANCE_MS`
constant): returns `100 - (gapMs / toleranceMs) * 100` — a context that
arrived instantly (gap 0) scores 100; one right at the existing 60-second
tolerance boundary scores 0. Computed against the gap between the
signal's own `current.createdAt` and whichever `scoresContext.timestamp`
ended up attached (regardless of whether it came from `current.evidence`
directly or the `previous`-fallback path — both are already gated fresh
relative to `current`'s own timestamp by the existing freshness fix, so a
single uniform tightness calculation is correct for both).

**Explicitly excludes reliability penalty** (SUSPENDED/UNRELIABLE) — the
user's named factors are magnitude, field pressure, and freshness only;
`momentumScore` already penalizes reliability separately, and adding it
here too would be scope creep beyond what was asked.

## Part 2: `GET /api/signal-performance`

New pure module, `apps/api/src/logic/signalPerformance.ts`:

```typescript
export interface SignalTypePerformance {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
}

export function summarizeSignalTypePerformance(
  entries: ArchiveEntry[]
): SignalTypePerformance[];
```

Groups archive entries by `signalType`, excludes `pending` entries,
counts `correct`/`incorrect` per group, computes `accuracyPct`. Pure,
tested with plain `ArchiveEntry` objects — no Supabase mocking needed for
the aggregation logic itself.

**Route**: `server.ts` calls the existing `getArchivedSignals({ event:
"settled" }, { page: 1, pageSize: 500 })` (a single bounded fetch of the
500 most recent settled signals — sufficient given this is a
single-tournament hackathon archive, not a use case needing full
historical pagination or Postgres-side `GROUP BY`), then
`summarizeSignalTypePerformance` on the result. Public GET, no API key,
covered by the existing general rate limiter. Fail-open inherited
automatically from `getArchivedSignals` itself (returns empty data if
Supabase is unconfigured, per the existing archive read endpoint's
established behavior) — no new fail-open logic needed here.

```json
{
  "data": [
    { "signalType": "SHARP_MOVE", "settledCount": 12, "correctCount": 9, "incorrectCount": 3, "accuracyPct": 75 }
  ],
  "summary": { "settledSignalsScanned": 40, "signalTypesReported": 3 }
}
```

## Docs

`openapi.yaml` gets a new `/api/signal-performance` path plus a schema
update to `AgentSignal` for the new `confidenceScore` field.

## Testing

- `calculateConfidenceScore` (new, in `signalEngine.test.ts`): magnitude-only
  when no `scoresContext` (full weight renormalized to the magnitude
  component alone), all three components blended when `scoresContext` is
  present, a signal at exactly the 15% magnitude reference scoring full
  marks on that component, freshness tightness at 0 gap vs. near the
  60-second boundary.
- `computeFreshnessTightness` (new, in `scoresContextFreshness.test.ts`):
  zero gap → 100, gap at the tolerance boundary → 0, gap beyond tolerance
  (defensive — shouldn't occur given upstream gating) → clamped to 0, not
  negative.
- `summarizeSignalTypePerformance` (new, `signalPerformance.test.ts`):
  empty input, single signal type with mixed correct/incorrect, multiple
  signal types, `pending` entries excluded from `settledCount`.

## Out of scope (explicitly deferred)

- No change to `severity`/`signalType` classification thresholds — this
  spec only adds a new, separate derived field, it does not change how
  the existing (stable, tested, everywhere-used-downstream) severity
  classification works.
- No reliability penalty in `confidenceScore` (see above).
- No dashboard panel for either piece — backend-only, matching the
  established pattern.
- No full-archive pagination for `/api/signal-performance` — a single
  bounded 500-row fetch is sufficient for this tournament's realistic data
  volume.
