# Composite Confidence Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new synchronous `confidenceScore` field to `AgentSignal` (blending magnitude, field pressure, and scoresContext freshness tightness), plus a separate async `GET /api/signal-performance` endpoint reporting historical hit-rate per signal type from the archive.

**Architecture:** `confidenceScore` is computed by a new pure `calculateConfidenceScore` function in `signalEngine.ts`, using a new graduated `computeFreshnessTightness` helper added to `scoresContextFreshness.ts` and the existing `FIELD_PRESSURE_MAX` constant (now exported from `marketMaker.ts`). Historical hit-rate is a separate pure module, `logic/signalPerformance.ts`, wired into its own route that reads from the existing archive — matching every other Supabase-dependent feature this session (async, separate from the core signal-creation loop).

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-composite-confidence-score-design.md`

## Global Constraints

- `confidenceScore?: number` is **optional** on `AgentSignal` — matches the existing `discordAlertStatus?:` precedent on the same interface. None of the 6 existing test files' local `makeSignal()` fixtures need updating (confirmed: no full-object `toEqual` assertions on `AgentSignal` anywhere in this codebase).
- Weights: magnitude 0.5 (always), field pressure 0.3, freshness tightness 0.2 (both only when `scoresContext` is present) — renormalized among only the available components when `scoresContext` is absent, so missing context never lowers the score (matches the existing "don't penalize UNKNOWN" precedent from `marketMaker.ts`).
- Magnitude normalized against 15% (the existing HIGH severity threshold); field pressure normalized against 45 (`marketMaker.ts`'s existing `FIELD_PRESSURE_MAX`, now exported rather than duplicated).
- `computeFreshnessTightness` returns `null` only when `tickTs`/`contextTimestamp` are missing (matching `isScoresContextFresh`'s own null-condition precedent); any computable gap, however large, maps to a `Math.max(0, ...)`-clamped 0-100 value, never negative.
- No reliability penalty in `confidenceScore` — out of scope per the design (the user's named factors are magnitude, field pressure, and freshness only).
- No change to `severity`/`signalType` classification or `momentumScore`'s existing formula — wholly additive.
- `GET /api/signal-performance` is a public GET, no API key, covered by the existing general rate limiter; fail-open is inherited automatically from `getArchivedSignals` (no new fail-open logic needed).
- Test runner: Vitest, run from `apps/api/` via `npm run test` (or `npx vitest run <path>` for a single file).
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged.

---

### Task 1: `computeFreshnessTightness` in `logic/scoresContextFreshness.ts`

**Files:**
- Modify: `apps/api/src/logic/scoresContextFreshness.ts`
- Modify: `apps/api/src/logic/scoresContextFreshness.test.ts`

**Interfaces:**
- Consumes: nothing new (pure function, same inputs as the existing sibling `isScoresContextFresh`).
- Produces: `computeFreshnessTightness(tickTs: number | undefined, contextTimestamp: string | undefined, toleranceMs: number): number | null` — consumed by Task 2 (`signalEngine.ts`).

- [ ] **Step 1: Write the failing tests**

Add these `describe` block and tests to the end of `apps/api/src/logic/scoresContextFreshness.test.ts` (after the existing `describe("isScoresContextFresh", ...)` block's closing `});`, keeping the existing import line and adding `computeFreshnessTightness` to it):

Find this exact line:

```typescript
import { isScoresContextFresh } from "./scoresContextFreshness";
```

Replace with:

```typescript
import { computeFreshnessTightness, isScoresContextFresh } from "./scoresContextFreshness";
```

Then add this new `describe` block at the end of the file (after the existing file's final `});`):

```typescript

describe("computeFreshnessTightness", () => {
  it("scores 100 when the gap is exactly zero", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(computeFreshnessTightness(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(100);
  });

  it("scores 0 when the gap is exactly at the tolerance boundary", () => {
    const tickTs = new Date("2026-07-07T01:01:00.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(computeFreshnessTightness(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(0);
  });

  it("scores 50 when the gap is halfway to the tolerance boundary", () => {
    const tickTs = new Date("2026-07-07T01:00:30.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(computeFreshnessTightness(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(50);
  });

  it("clamps to 0, not negative, when the gap exceeds the tolerance", () => {
    const tickTs = new Date("2026-07-07T01:01:30.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(computeFreshnessTightness(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(0);
  });

  it("returns null when the tick timestamp is missing", () => {
    expect(
      computeFreshnessTightness(undefined, "2026-07-07T01:00:00.000Z", TOLERANCE_MS)
    ).toBeNull();
  });

  it("returns null when the context timestamp is missing", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();

    expect(computeFreshnessTightness(tickTs, undefined, TOLERANCE_MS)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/scoresContextFreshness.test.ts
```

Expected: FAIL — `computeFreshnessTightness` is not exported from `./scoresContextFreshness` yet.

- [ ] **Step 3: Write the implementation**

In `apps/api/src/logic/scoresContextFreshness.ts`, add this function after the existing `isScoresContextFresh` function (at the end of the file):

```typescript

/**
 * Graduated companion to isScoresContextFresh: instead of a pass/fail
 * gate, reports how tight the gap actually is on a 0-100 scale - a
 * context that arrived instantly scores 100, one right at the tolerance
 * boundary scores 0. Used by signalEngine.ts's confidenceScore, which
 * cares about degree of freshness, not just whether the existing gate was
 * passed. Only returns null when the inputs themselves are missing
 * (matching isScoresContextFresh's own null-condition precedent) - any
 * computable gap, however large, clamps to 0 rather than going negative.
 */
export function computeFreshnessTightness(
  tickTs: number | undefined,
  contextTimestamp: string | undefined,
  toleranceMs: number
): number | null {
  if (!tickTs || !contextTimestamp) return null;

  const contextMs = new Date(contextTimestamp).getTime();
  const gapMs = Math.abs(tickTs - contextMs);

  return Math.max(0, 100 - (gapMs / toleranceMs) * 100);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/scoresContextFreshness.test.ts
```

Expected: PASS, all 13 tests green (7 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/scoresContextFreshness.ts apps/api/src/logic/scoresContextFreshness.test.ts
git commit -m "Add graduated freshness-tightness measure alongside the existing pass/fail gate"
```

---

### Task 2: `confidenceScore` on `AgentSignal` via `calculateConfidenceScore` in `signalEngine.ts`

**Files:**
- Modify: `apps/api/src/types.ts` (`AgentSignal` interface)
- Modify: `apps/api/src/logic/marketMaker.ts` (export `FIELD_PRESSURE_MAX`)
- Modify: `apps/api/src/logic/signalEngine.ts`
- Modify: `apps/api/src/logic/signalEngine.test.ts`

**Interfaces:**
- Consumes: `computeFreshnessTightness` (Task 1, `./scoresContextFreshness`); `FIELD_PRESSURE_MAX` (this task, `./marketMaker`).
- Produces: `AgentSignal.confidenceScore?: number`, populated by every signal `buildSignalFromSnapshots` creates — consumed by any future frontend/dashboard work (out of scope here), and automatically included wherever `AgentSignal` objects already flow (e.g. `GET /api/signals`, the archive's `signal_data` blob) with no further code changes needed.

- [ ] **Step 1: Add `confidenceScore` to the `AgentSignal` interface**

In `apps/api/src/types.ts`, find:

```typescript
export interface AgentSignal {
  id: string;
  matchId: string;
  match: string;
  target: string;
  side: TeamSide;
  signalType: SignalType;
  severity: Severity;
  oddsBefore: number;
  oddsAfter: number;
  oddsChangePct: number;
  momentumScore: number;
  explanation: string;
  createdAt: string;
  resultStatus: "pending" | "correct" | "incorrect";
  evidence?: TxLineEvidence;
  discordAlertStatus?: "sent" | "failed" | "not_configured";
}
```

Replace with:

```typescript
export interface AgentSignal {
  id: string;
  matchId: string;
  match: string;
  target: string;
  side: TeamSide;
  signalType: SignalType;
  severity: Severity;
  oddsBefore: number;
  oddsAfter: number;
  oddsChangePct: number;
  momentumScore: number;
  confidenceScore?: number;
  explanation: string;
  createdAt: string;
  resultStatus: "pending" | "correct" | "incorrect";
  evidence?: TxLineEvidence;
  discordAlertStatus?: "sent" | "failed" | "not_configured";
}
```

- [ ] **Step 2: Export `FIELD_PRESSURE_MAX` from `marketMaker.ts`**

In `apps/api/src/logic/marketMaker.ts`, find:

```typescript
const MAX_PRESSURE_CONTRIBUTION_PCT = 6;
const FIELD_PRESSURE_MAX = 45;
```

Replace with:

```typescript
const MAX_PRESSURE_CONTRIBUTION_PCT = 6;
export const FIELD_PRESSURE_MAX = 45;
```

- [ ] **Step 3: Write the failing tests**

In `apps/api/src/logic/signalEngine.test.ts`, add this import line right after the existing `import type { OddsSnapshot } from "../types";` line:

```typescript
import { calculateConfidenceScore } from "./signalEngine";
```

Then add this new `describe` block at the end of the file:

```typescript

describe("calculateConfidenceScore", () => {
  it("falls back to the magnitude component alone when no scoresContext is present", () => {
    // 7.5% is half of the 15% magnitude reference, so magnitudeScore is 50;
    // with no scoresContext, weight renormalizes to the magnitude component
    // alone, so the result is exactly 50, not dragged down by two missing
    // components.
    expect(calculateConfidenceScore(7.5, undefined, null)).toBe(50);
  });

  it("clamps the magnitude component at 100 for a move beyond the 15% reference", () => {
    expect(calculateConfidenceScore(25, undefined, null)).toBe(100);
  });

  it("blends all three components with their configured weights", () => {
    // magnitude=15% -> 100, fieldPressureScore=0 -> 0, freshnessTightness=0.
    // Expected: 100*0.5 + 0*0.3 + 0*0.2 = 50.
    const scoresContext = { fieldPressureScore: 0 };
    expect(calculateConfidenceScore(15, scoresContext, 0)).toBe(50);
  });
});
```

Then add these two wiring tests inside the existing `describe("buildSignalFromSnapshots", ...)` block, right after the existing `it("clamps momentumScore to the 0-100 range", ...)` test (before that block's closing `});`):

```typescript

  it("computes a fully-blended confidenceScore when scoresContext is attached", () => {
    const previous = makeSnapshot({
      homeOdds: 2.0,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:00:00.000Z",
    });
    const current = makeSnapshot({
      homeOdds: 1.7,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:01:00.000Z",
      evidence: {
        source: "txline",
        scoresContext: {
          fieldPressureScore: 45,
          timestamp: "2026-07-08T10:01:00.000Z",
        },
      },
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.confidenceScore).toBe(100);
  });

  it("falls back to a magnitude-only confidenceScore when no scoresContext is attached", () => {
    const previous = makeSnapshot({
      homeOdds: 2.0,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:00:00.000Z",
    });
    const current = makeSnapshot({
      homeOdds: 1.85,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:01:00.000Z",
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.confidenceScore).toBe(50);
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/signalEngine.test.ts
```

Expected: FAIL — `calculateConfidenceScore` is not exported from `./signalEngine` yet, and `signal.confidenceScore` is `undefined` in the wiring tests.

- [ ] **Step 5: Write the implementation**

In `apps/api/src/logic/signalEngine.ts`, find the existing import line:

```typescript
import { AgentSignal, OddsSnapshot, Severity, TeamSide, TxLineScoresContext } from "../types";
import { isScoresContextFresh, SCORES_CONTEXT_TOLERANCE_MS } from "./scoresContextFreshness";
```

Replace with:

```typescript
import { AgentSignal, OddsSnapshot, Severity, TeamSide, TxLineScoresContext } from "../types";
import {
  computeFreshnessTightness,
  isScoresContextFresh,
  SCORES_CONTEXT_TOLERANCE_MS,
} from "./scoresContextFreshness";
import { FIELD_PRESSURE_MAX } from "./marketMaker";
```

Then find the existing `calculateMomentumScore` function and add `calculateConfidenceScore` right after it (before `sideLabel`):

```typescript
function calculateMomentumScore(
  changePct: number,
  minute: number,
  scoreChanged: boolean,
  scoresContext?: TxLineScoresContext
) {
  const oddsWeight = changePct * 0.55;
  const scoreImpact = scoreChanged ? 20 * 0.25 : 0;
  const timePressure = Math.min(minute / 90, 1) * 20 * 0.2;
  const fieldPressure = (scoresContext?.fieldPressureScore ?? 0) * 0.35;
  const reliabilityPenalty =
    scoresContext?.reliability === "SUSPENDED"
      ? 18
      : scoresContext?.reliability === "UNRELIABLE"
        ? 10
        : 0;

  return round(clamp(oddsWeight + scoreImpact + timePressure + fieldPressure - reliabilityPenalty, 0, 100));
}

const MAGNITUDE_REFERENCE_PCT = 15;

/**
 * A composite confidence measure, separate from severity/momentumScore:
 * magnitude (weight 0.5, normalized against the existing 15% HIGH severity
 * threshold), field pressure (weight 0.3, normalized against
 * marketMaker.ts's own FIELD_PRESSURE_MAX), and freshness tightness
 * (weight 0.2). Weights are renormalized among only the available
 * components when scoresContext is absent, so a signal with no field
 * context is scored on magnitude alone rather than penalized for missing
 * data it never had a chance to have.
 */
export function calculateConfidenceScore(
  changePct: number,
  scoresContext: TxLineScoresContext | undefined,
  freshnessTightness: number | null
): number {
  const magnitudeScore = clamp((changePct / MAGNITUDE_REFERENCE_PCT) * 100, 0, 100);

  const components: { score: number; weight: number }[] = [{ score: magnitudeScore, weight: 0.5 }];

  if (scoresContext && freshnessTightness !== null) {
    const fieldPressureScore = clamp(
      ((scoresContext.fieldPressureScore ?? 0) / FIELD_PRESSURE_MAX) * 100,
      0,
      100
    );
    components.push({ score: fieldPressureScore, weight: 0.3 });
    components.push({ score: clamp(freshnessTightness, 0, 100), weight: 0.2 });
  }

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const weightedSum = components.reduce(
    (sum, component) => sum + component.score * component.weight,
    0
  );

  return round(weightedSum / totalWeight);
}
```

Then find the section in `buildSignalFromSnapshots` where `scoresContext` and `momentumScore` are computed:

```typescript
  const scoresContext =
    current.evidence?.scoresContext ??
    (isScoresContextFresh(
      new Date(current.createdAt).getTime(),
      previous.evidence?.scoresContext?.timestamp,
      SCORES_CONTEXT_TOLERANCE_MS
    )
      ? previous.evidence?.scoresContext
      : undefined);

  const momentumScore = calculateMomentumScore(
    bestChangePct,
    current.minute,
    scoreChanged,
    scoresContext
  );
```

Replace with:

```typescript
  const scoresContext =
    current.evidence?.scoresContext ??
    (isScoresContextFresh(
      new Date(current.createdAt).getTime(),
      previous.evidence?.scoresContext?.timestamp,
      SCORES_CONTEXT_TOLERANCE_MS
    )
      ? previous.evidence?.scoresContext
      : undefined);

  const freshnessTightness = scoresContext
    ? computeFreshnessTightness(
        new Date(current.createdAt).getTime(),
        scoresContext.timestamp,
        SCORES_CONTEXT_TOLERANCE_MS
      )
    : null;

  const momentumScore = calculateMomentumScore(
    bestChangePct,
    current.minute,
    scoreChanged,
    scoresContext
  );

  const confidenceScore = calculateConfidenceScore(bestChangePct, scoresContext, freshnessTightness);
```

Finally, find the returned signal object's `momentumScore` field:

```typescript
    momentumScore,
    explanation,
```

Replace with:

```typescript
    momentumScore,
    confidenceScore,
    explanation,
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/signalEngine.test.ts
```

Expected: PASS, all tests green (existing tests plus 3 new `calculateConfidenceScore` tests plus 2 new wiring tests).

- [ ] **Step 7: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass — confirms none of the other 5 test files' `makeSignal()` fixtures broke from the new optional field.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/logic/marketMaker.ts apps/api/src/logic/signalEngine.ts apps/api/src/logic/signalEngine.test.ts
git commit -m "Add composite confidenceScore to every generated signal"
```

---

### Task 3: `summarizeSignalTypePerformance` in `logic/signalPerformance.ts`

**Files:**
- Create: `apps/api/src/logic/signalPerformance.ts`
- Create: `apps/api/src/logic/signalPerformance.test.ts`

**Interfaces:**
- Consumes: `ArchiveEntry`, `AgentSignal` (existing, `../types`).
- Produces: `SignalTypePerformance` type, `summarizeSignalTypePerformance(entries: ArchiveEntry[]): SignalTypePerformance[]` — consumed by Task 4 (`server.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/logic/signalPerformance.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { summarizeSignalTypePerformance } from "./signalPerformance";
import type { AgentSignal, ArchiveEntry } from "../types";

function makeAgentSignal(overrides: Partial<AgentSignal> = {}): AgentSignal {
  return {
    id: "signal-1",
    matchId: "match-1",
    match: "Team A vs Team B",
    target: "Team A",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    oddsBefore: 2.0,
    oddsAfter: 1.5,
    oddsChangePct: 25,
    momentumScore: 50,
    explanation: "test",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    signalId: "signal-1",
    event: "settled",
    matchId: "match-1",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    resultStatus: "correct",
    momentumScore: 50,
    oddsChangePct: 20,
    archivedAt: new Date().toISOString(),
    signalData: makeAgentSignal(),
    ...overrides,
  };
}

describe("summarizeSignalTypePerformance", () => {
  it("returns an empty array for no entries", () => {
    expect(summarizeSignalTypePerformance([])).toEqual([]);
  });

  it("computes accuracy for a single signal type with mixed outcomes", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s2", signalType: "SHARP_MOVE", resultStatus: "incorrect" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result).toEqual([
      {
        signalType: "SHARP_MOVE",
        settledCount: 3,
        correctCount: 2,
        incorrectCount: 1,
        accuracyPct: 67,
      },
    ]);
  });

  it("reports multiple signal types separately", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "MOMENTUM_SHIFT", resultStatus: "incorrect" }),
      makeEntry({ signalId: "s2", signalType: "MOMENTUM_SHIFT", resultStatus: "correct" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result).toEqual([
      { signalType: "SHARP_MOVE", settledCount: 1, correctCount: 1, incorrectCount: 0, accuracyPct: 100 },
      { signalType: "MOMENTUM_SHIFT", settledCount: 2, correctCount: 1, incorrectCount: 1, accuracyPct: 50 },
    ]);
  });

  it("excludes pending entries from settledCount", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "SHARP_MOVE", resultStatus: "pending" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result).toEqual([
      { signalType: "SHARP_MOVE", settledCount: 1, correctCount: 1, incorrectCount: 0, accuracyPct: 100 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/signalPerformance.test.ts
```

Expected: FAIL — `Cannot find module './signalPerformance'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/logic/signalPerformance.ts`:

```typescript
import type { ArchiveEntry } from "../types";

export interface SignalTypePerformance {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
}

/**
 * Groups archived signal entries by signalType and reports historical
 * accuracy per type from settled outcomes. Pending entries (never
 * settled) are excluded entirely - they carry no historical-accuracy
 * information.
 */
export function summarizeSignalTypePerformance(
  entries: ArchiveEntry[]
): SignalTypePerformance[] {
  const bySignalType = new Map<string, ArchiveEntry[]>();

  for (const entry of entries) {
    if (entry.resultStatus === "pending") continue;

    const existing = bySignalType.get(entry.signalType) ?? [];
    existing.push(entry);
    bySignalType.set(entry.signalType, existing);
  }

  return Array.from(bySignalType.entries()).map(([signalType, group]) => {
    const correctCount = group.filter((entry) => entry.resultStatus === "correct").length;
    const incorrectCount = group.length - correctCount;

    return {
      signalType,
      settledCount: group.length,
      correctCount,
      incorrectCount,
      accuracyPct: Math.round((correctCount / group.length) * 100),
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/signalPerformance.test.ts
```

Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/signalPerformance.ts apps/api/src/logic/signalPerformance.test.ts
git commit -m "Add pure signal-type historical performance aggregation"
```

---

### Task 4: Register `GET /api/signal-performance` in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `summarizeSignalTypePerformance` (Task 3, `./logic/signalPerformance`); `getArchivedSignals` (existing, `./services/archive`, already imported).
- Produces: the live `GET /api/signal-performance` route, consumed by Task 5 (openapi.yaml documentation).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, add this import line right after the existing `import { findSignalClusters, CORRELATION_WINDOW_MS } from "./logic/signalCorrelation";` line:

```typescript
import { summarizeSignalTypePerformance } from "./logic/signalPerformance";
```

- [ ] **Step 2: Add the route**

Find this exact block in `apps/api/src/server.ts` (the end of the `GET /api/signal-correlation` route):

```typescript
app.get("/api/signal-correlation", (_req, res) => {
  const clusters = findSignalClusters(store.signals, CORRELATION_WINDOW_MS);

  res.json({
    data: clusters,
    summary: {
      signalsScanned: store.signals.length,
      clustersDetected: clusters.length,
    },
  });
});
```

Add this new route immediately after it:

```typescript
app.get("/api/signal-correlation", (_req, res) => {
  const clusters = findSignalClusters(store.signals, CORRELATION_WINDOW_MS);

  res.json({
    data: clusters,
    summary: {
      signalsScanned: store.signals.length,
      clustersDetected: clusters.length,
    },
  });
});

app.get("/api/signal-performance", async (_req, res) => {
  const result = await getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 });
  const performance = summarizeSignalTypePerformance(result.data);

  res.json({
    data: performance,
    summary: {
      settledSignalsScanned: result.data.length,
      signalTypesReported: performance.length,
    },
  });
});
```

- [ ] **Step 3: Verify the project builds**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no type errors.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass, total test count higher than the pre-existing 132.

- [ ] **Step 5: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`), then in another terminal:

```bash
curl -s "http://localhost:4000/api/signal-performance" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log('summary:', JSON.stringify(body.summary, null, 2));
  console.log('data:', JSON.stringify(body.data, null, 2));
});
"
```

Expected: since this dev environment has no live Supabase credentials, `getArchivedSignals` fails open — expect `data: []` and `summary: { settledSignalsScanned: 0, signalTypesReported: 0 }`, not an error. This is the expected local-dev result, not a bug (matches the existing `GET /api/archive` endpoint's own documented fail-open behavior in the same environment).

Also spot-check `confidenceScore` on a live signal:

```bash
curl -s "http://localhost:4000/api/signals" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log('first signal confidenceScore:', body.data[0]?.confidenceScore);
});
"
```

Expected: a number between 0 and 100 (if any signals exist yet in this dev session's simulated feed — an empty `data: []` if none have fired yet is equally valid).

Stop the dev server afterward by finding its PID (`netstat -ano | grep ":4000.*LISTENING"` on Windows), confirming via its command line that it's the one you started, and killing that exact PID; prefer an alternate port (e.g. `PORT=4060 npm run dev`) if port 4000 is already occupied by something you didn't start.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Register GET /api/signal-performance route"
```

---

### Task 5: Document `confidenceScore` and `GET /api/signal-performance` in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: the type change from Task 2 and the route from Task 4 (documents actual behavior; no code dependency).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add `confidenceScore` to the `AgentSignal` schema**

Find this exact block:

```yaml
    AgentSignal:
      type: object
      properties:
        id: { type: string }
        matchId: { type: string }
        match: { type: string }
        target: { type: string }
        side: { type: string, enum: [home, away] }
        signalType: { type: string, enum: [SHARP_MOVE, WATCH, MOMENTUM_SHIFT, NO_ACTION] }
        severity: { type: string, enum: [HIGH, MEDIUM, LOW, NONE] }
        oddsBefore: { type: number }
        oddsAfter: { type: number }
        oddsChangePct: { type: number }
        momentumScore: { type: number }
        explanation: { type: string }
        createdAt: { type: string, format: date-time }
        resultStatus: { type: string, enum: [pending, correct, incorrect] }
        evidence:
          $ref: '#/components/schemas/TxLineEvidence'
        discordAlertStatus: { type: string, enum: [sent, failed, not_configured] }
      required: [id, matchId, match, target, side, signalType, severity, oddsBefore, oddsAfter, oddsChangePct, momentumScore, explanation, createdAt, resultStatus]
```

Replace with:

```yaml
    AgentSignal:
      type: object
      properties:
        id: { type: string }
        matchId: { type: string }
        match: { type: string }
        target: { type: string }
        side: { type: string, enum: [home, away] }
        signalType: { type: string, enum: [SHARP_MOVE, WATCH, MOMENTUM_SHIFT, NO_ACTION] }
        severity: { type: string, enum: [HIGH, MEDIUM, LOW, NONE] }
        oddsBefore: { type: number }
        oddsAfter: { type: number }
        oddsChangePct: { type: number }
        momentumScore: { type: number }
        confidenceScore:
          type: number
          description: >
            Composite measure (0-100) blending compression magnitude, field
            pressure, and scoresContext freshness tightness. Weights
            renormalize among only the available components when
            scoresContext is absent, so missing context never lowers the
            score. Separate from severity/momentumScore, which are
            unchanged.
        explanation: { type: string }
        createdAt: { type: string, format: date-time }
        resultStatus: { type: string, enum: [pending, correct, incorrect] }
        evidence:
          $ref: '#/components/schemas/TxLineEvidence'
        discordAlertStatus: { type: string, enum: [sent, failed, not_configured] }
      required: [id, matchId, match, target, side, signalType, severity, oddsBefore, oddsAfter, oddsChangePct, momentumScore, explanation, createdAt, resultStatus]
```

(`confidenceScore` is deliberately absent from `required` — it's an optional field, matching `discordAlertStatus`'s existing treatment in this same schema.)

- [ ] **Step 2: Add the `/api/signal-performance` path**

Find this exact block (the end of the `/api/signal-correlation` path, right before `/api/onchain/validate-stat`):

```yaml
                  summary:
                    type: object
                    properties:
                      signalsScanned: { type: number }
                      clustersDetected: { type: number }
                    required: [signalsScanned, clustersDetected]
                required: [data, summary]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/onchain/validate-stat:
```

Replace with:

```yaml
                  summary:
                    type: object
                    properties:
                      signalsScanned: { type: number }
                      clustersDetected: { type: number }
                    required: [signalsScanned, clustersDetected]
                required: [data, summary]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/signal-performance:
    get:
      summary: Historical hit-rate per signal type
      description: >
        Reads the most recent 500 settled entries from the insert-only
        signal archive and reports accuracy per signal type
        (SHARP_MOVE/WATCH/MOMENTUM_SHIFT/NO_ACTION). Fail-open: returns
        200 with empty data if Supabase is unconfigured or unreachable,
        inherited from the existing GET /api/archive endpoint's own
        fail-open behavior.
      responses:
        '200':
          description: Historical accuracy per signal type, plus a scan summary.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        signalType: { type: string }
                        settledCount: { type: number }
                        correctCount: { type: number }
                        incorrectCount: { type: number }
                        accuracyPct: { type: number }
                      required: [signalType, settledCount, correctCount, incorrectCount, accuracyPct]
                  summary:
                    type: object
                    properties:
                      settledSignalsScanned: { type: number }
                      signalTypesReported: { type: number }
                    required: [settledSignalsScanned, signalTypesReported]
                required: [data, summary]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/onchain/validate-stat:
```

- [ ] **Step 3: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same pre-existing cosmetic `operationId` warnings as before (no new errors).

- [ ] **Step 4: Commit**

```bash
git add openapi.yaml
git commit -m "Document confidenceScore and GET /api/signal-performance in openapi.yaml"
```

---

### Task 6: Final verification and docs update

**Files:**
- Modify: `PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5 (this task only verifies and documents; no new production code).
- Produces: nothing further — this is the last task in the plan.

- [ ] **Step 1: Run the full test suite**

```bash
cd apps/api && npm run test
```

Expected: all test files pass. Note the exact new total test count (was 132 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`, add a new section (after "Signal Correlation Across Simultaneous Matches") describing both pieces: the `confidenceScore` formula and weight-renormalization rule, and the `GET /api/signal-performance` endpoint. Add `logic/signalPerformance.ts` to the "Important backend files" list. Update the existing "Scores Intelligence Layer"/signal-related description if it lists `AgentSignal` fields explicitly (check first — only touch it if it does).

In `SUBMISSION_NOTES.md`, add a matching entry under "Major Features Added This Session" (numbered continuing from the existing "8. Signal Correlation Across Simultaneous Matches" entry) describing the same feature in the narrative style already used there, including the sync/async architectural split as a real design decision worth mentioning (matching how prior entries there describe real findings, e.g. the Market Maker circularity problem).

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`:
- Add `GET /api/signal-performance (historical hit-rate per signal type)` to the API Endpoints list, right after `GET /api/signal-correlation`.
- Update the automated-test-count line to the real number measured in Step 1.

In `PROJECT_STATE.md`:
- Add a new dated entry describing this feature (spec/plan file paths, the sync/async split, the weight-renormalization rule, the new `AgentSignal.confidenceScore` field).
- Update the "21 backend routes total" count to 22 and add `/api/signal-performance` to the route list.
- Update the test file list/count to match Step 1's real number, including `logic/signalPerformance.test.ts` in the file list.
- Update the handoff status block per the standing update-cadence instruction: mark #7 done, move to #8.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document composite confidence score and signal-type performance across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the entire branch's diff (all 6 tasks' commits together) before merging to `main` — do not merge without it.
