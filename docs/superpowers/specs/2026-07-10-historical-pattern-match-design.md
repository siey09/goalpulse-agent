# Historical Pattern Match Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

`signal_archive` has accumulated low hundreds of settled signals with known
outcomes, but nothing in the product connects a signal you're currently
looking at to how similar signals have historically resolved. This is one
of four candidate novel-mechanism ideas recorded 2026-07-10
(`PROJECT_STATE.md`'s "Future ideas — not started") and is now being built.

## Similarity definition

`signalType` (`SHARP_MOVE`/`WATCH`/`MOMENTUM_SHIFT`) is a hard filter, not a
ranking dimension — it's a pure deterministic function of `severity`
(`logic/signalEngine.ts:211-214`), so severity and signalType carry
identical information; using both would double-count the same fact. Within
the same `signalType`, candidates are ranked by distance on two independent
continuous dimensions:

- `oddsChangePct` (always present)
- `evidence.scoresContext.fieldPressureScore` (only present when TXODDS
  field context was available) — only factored into distance when **both**
  the target signal and the candidate have it; never imputed.

```typescript
const ODDS_CHANGE_SPREAD = 30;
const FIELD_PRESSURE_SPREAD = 45; // matches SignalIntelligencePanel's own "/45" display

function distance(target: SimilarSignalsParams, candidate: ArchiveEntry): number {
  let total = 0;

  if (target.oddsChangePct !== undefined) {
    total += Math.abs(target.oddsChangePct - candidate.oddsChangePct) / ODDS_CHANGE_SPREAD;
  }

  const candidateFieldPressure = candidate.signalData?.evidence?.scoresContext?.fieldPressureScore;
  if (target.fieldPressureScore !== undefined && typeof candidateFieldPressure === "number") {
    total += Math.abs(target.fieldPressureScore - candidateFieldPressure) / FIELD_PRESSURE_SPREAD;
  }

  return total;
}
```

**Match-concentration safeguard** (same class of bug already found and
fixed twice this session — Signal Performance's `distinctMatchCount`,
Signal Correlation's client-side dedup): the target signal's own match is
excluded entirely (via `baseMatchId`, covering the `<fixtureId>-totals-<line>`
suffix), and at most 2 candidates per real match survive into the final
ranked list, so one repeatedly-firing match can't fill the whole
comparison set.

**Final selection:** filter (same `signalType`, settled only, not the
target's own match) → group by `baseMatchId`, keep the closest 2 per group
→ flatten and sort all survivors by distance ascending → take the closest
5 overall.

## Where it surfaces

The existing `selectedSignal` detail modal in `App.tsx` (opens for any
signal clicked anywhere in the app — search results, signals list, outcome
verification list), not `SignalIntelligencePanel.tsx` (shows only one
computed "best" signal system-wide, never a specific clicked one) and not
a new standalone panel (that would be an aggregate view untethered from
whichever signal you're inspecting). A new "Similar past signals" section
is added as the last block inside the modal, after the existing "Decision
path" section (`App.tsx:3748-3784`).

## Computation timing

On-demand, computed fresh per request — matching every other archive-backed
analytics endpoint in this codebase (`/api/signal-performance`,
`/api/signal-performance/by-confidence`, `/api/arena/backtest`, all of
which call `getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 })`
directly and compute their summary fresh on each request, no caching layer
anywhere). No precompute/cache: the archive is small (low hundreds of
rows), the query only fires when a signal's detail modal is opened (not on
any polling loop), and precomputing would need its own invalidation logic
(when does a new settlement change the comparison pool?) for a query this
cheap — not worth the complexity.

## Backend

**New pure logic module** `apps/api/src/logic/historicalPatternMatch.ts`,
matching this session's established convention (`signalPerformance.ts`,
`signalCorrelation.ts`, `steamDetection.ts` — pure function over
`ArchiveEntry[]`/`AgentSignal[]`, unit tested, wired into a thin route
handler):

```typescript
import type { ArchiveEntry } from "../types";

export interface SimilarSignalsParams {
  signalType?: string;
  oddsChangePct?: number;
  fieldPressureScore?: number;
  excludeMatchId?: string;
}

export interface SimilarSignalEntry {
  matchId: string;
  signalType: string;
  severity: string;
  oddsChangePct: number;
  fieldPressureScore?: number;
  resultStatus: "correct" | "incorrect";
  archivedAt: string;
}

export interface SimilarSignalsResult {
  count: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
  signals: SimilarSignalEntry[];
}

const ODDS_CHANGE_SPREAD = 30;
const FIELD_PRESSURE_SPREAD = 45;
const MAX_PER_MATCH = 2;
const MAX_RESULTS = 5;

function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}

function distance(target: SimilarSignalsParams, candidate: ArchiveEntry): number {
  let total = 0;

  if (target.oddsChangePct !== undefined) {
    total += Math.abs(target.oddsChangePct - candidate.oddsChangePct) / ODDS_CHANGE_SPREAD;
  }

  const candidateFieldPressure = candidate.signalData?.evidence?.scoresContext?.fieldPressureScore;
  if (target.fieldPressureScore !== undefined && typeof candidateFieldPressure === "number") {
    total += Math.abs(target.fieldPressureScore - candidateFieldPressure) / FIELD_PRESSURE_SPREAD;
  }

  return total;
}

function emptyResult(): SimilarSignalsResult {
  return { count: 0, correctCount: 0, incorrectCount: 0, accuracyPct: 0, signals: [] };
}

/**
 * Finds settled archive signals of the same signalType as the target,
 * ranked by closeness on oddsChangePct/fieldPressureScore, excluding the
 * target's own match and capping each other match to 2 contributions so
 * one repeatedly-firing match can't dominate the comparison set (same
 * concentration bug class already found and fixed for Signal Performance
 * and Signal Correlation).
 */
export function findSimilarSignals(
  entries: ArchiveEntry[],
  target: SimilarSignalsParams
): SimilarSignalsResult {
  if (!target.signalType) return emptyResult();

  const excludeBase = target.excludeMatchId ? baseMatchId(target.excludeMatchId) : undefined;

  const candidates = entries.filter(
    (entry) =>
      entry.resultStatus !== "pending" &&
      entry.signalType === target.signalType &&
      (!excludeBase || baseMatchId(entry.matchId) !== excludeBase)
  );

  const byMatch = new Map<string, ArchiveEntry[]>();
  for (const entry of candidates) {
    const base = baseMatchId(entry.matchId);
    const existing = byMatch.get(base) ?? [];
    existing.push(entry);
    byMatch.set(base, existing);
  }

  const capped: ArchiveEntry[] = [];
  for (const group of byMatch.values()) {
    const sorted = [...group].sort((a, b) => distance(target, a) - distance(target, b));
    capped.push(...sorted.slice(0, MAX_PER_MATCH));
  }

  const selected = capped
    .sort((a, b) => distance(target, a) - distance(target, b))
    .slice(0, MAX_RESULTS);

  if (selected.length === 0) return emptyResult();

  const correctCount = selected.filter((entry) => entry.resultStatus === "correct").length;
  const incorrectCount = selected.length - correctCount;

  return {
    count: selected.length,
    correctCount,
    incorrectCount,
    accuracyPct: Math.round((correctCount / selected.length) * 100),
    signals: selected.map((entry) => ({
      matchId: entry.matchId,
      signalType: entry.signalType,
      severity: entry.severity,
      oddsChangePct: entry.oddsChangePct,
      fieldPressureScore: entry.signalData?.evidence?.scoresContext?.fieldPressureScore,
      resultStatus: entry.resultStatus as "correct" | "incorrect",
      archivedAt: entry.archivedAt,
    })),
  };
}
```

**Query param parsing** — new `parseSimilarSignalsParams` in
`apps/api/src/logic/paginationParams.ts` (this file already holds
`parseArchiveFilters`, despite the file's name — matching existing
placement rather than introducing a new file for one function). Per the
project's established permissive-parsing convention
(`parsePageParam`/`parsePageSizeParam`/`parseArchiveFilters` — invalid or
missing values degrade to "omit this field" or a safe default, never an
error):

```typescript
export function parseSimilarSignalsParams(
  query: Record<string, unknown>
): SimilarSignalsParams {
  const params: SimilarSignalsParams = {};

  if (typeof query.signalType === "string" && query.signalType.length > 0) {
    params.signalType = query.signalType;
  }

  const oddsChangePct = Number(query.oddsChangePct);
  if (Number.isFinite(oddsChangePct)) {
    params.oddsChangePct = oddsChangePct;
  }

  const fieldPressureScore = Number(query.fieldPressureScore);
  if (Number.isFinite(fieldPressureScore)) {
    params.fieldPressureScore = fieldPressureScore;
  }

  if (typeof query.excludeMatchId === "string" && query.excludeMatchId.length > 0) {
    params.excludeMatchId = query.excludeMatchId;
  }

  return params;
}
```

Missing/invalid `signalType` → `findSimilarSignals` returns the empty
result (no error). Missing/invalid numeric params → that distance term is
simply skipped for every candidate (falls back to whatever ranking the
remaining terms produce, or stable input order if neither numeric param is
usable) — never a crash, never a 400.

**Route** (`apps/api/src/server.ts`, nested under `/api/archive` matching
`/api/signal-performance/by-confidence`'s and `/api/signal-correlation/patterns`'s
nesting convention):

```typescript
app.get("/api/archive/similar-signals", async (req, res) => {
  const params = parseSimilarSignalsParams(req.query as Record<string, unknown>);
  const result = await getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 });
  const similar = findSimilarSignals(result.data, params);

  res.json({ data: similar });
});
```

**Tests** (`apps/api/src/logic/historicalPatternMatch.test.ts`, matching
`signalPerformance.test.ts`'s plain-object-fixture style): same-signalType
filtering, distance ranking order, own-match exclusion via `excludeMatchId`
(including the `-totals-` suffix case), per-match cap of 2, top-5 cap,
missing-`fieldPressureScore`-on-one-side skips that term, missing
`signalType` returns the empty result, empty `entries` input returns the
empty result.

## Frontend

**New fetch**, `apps/web/src/App.tsx`: a `useEffect` keyed on
`selectedSignal?.id` that fires when the detail modal opens, calling
`GET /api/archive/similar-signals` with the currently-selected signal's own
`signalType` (via the existing `getSignalType()` helper),
`oddsChangePct`, `evidence.scoresContext.fieldPressureScore`, and
`matchId` (as `excludeMatchId`). New state: `similarSignals` (result or
`null`) and `isSimilarSignalsLoading`. Cleared back to `null` when the
modal closes (`selectedSignal` becomes `null`) so stale data never flashes
for the next-opened signal.

**New UI section**, appended after the existing "Decision path" block
(`App.tsx:3748-3784`), styled consistently with the modal's other
rounded-2xl sub-sections:

- Loading: `"Checking historical precedent..."`.
- Fewer than 3 signals returned (`similarSignals.count < 3`): `"Not enough
  similar past signals yet."` — matching `ConfidenceCalibrationPanel.tsx:85`'s
  exact existing phrasing for this situation.
- 3+ signals: a summary line (`"X of Y similar past signals resolved
  correct (Z%)"`), then one row per signal showing match id, compression %,
  field pressure (or "—" when absent), and a correct/incorrect badge reusing
  the exact color convention already used for outcome badges elsewhere in
  this same modal (`App.tsx:2849-2856`: emerald for correct, red for
  incorrect).

No new dependencies. Pure additive change to `App.tsx` plus two new backend
files — no existing panel, route, or chart behavior touched.

## Out of scope (explicitly deferred)

- No UI on `SignalIntelligencePanel.tsx` — it only ever shows one computed
  "best" signal, not a specific clicked one, so it isn't the right home
  for per-signal historical context.
- No caching/precomputation layer (see "Computation timing" above).
- No cross-signalType comparison (e.g. "how did MEDIUM signals with a
  similar compression to this HIGH one do") — `signalType` stays a hard
  filter, matching how every other accuracy metric in this app groups by
  signal type or confidence bucket, never mixes them.
- No dashboard-level aggregate view of pattern-match accuracy — this is
  deliberately a per-signal, on-demand lookup, not a new metrics panel.
