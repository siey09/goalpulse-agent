# Pattern-Matched Signal Correlation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/signal-correlation/patterns`, detecting cross-match clusters where the *same* pattern (side + severity + market) repeats across 2+ matches within the existing 5-minute correlation window — a stricter, more specific detection than the existing time-proximity-only `GET /api/signal-correlation`.

**Architecture:** Extract the existing session-windowing loop out of `findSignalClusters` into a shared, generic `sessionWindowGroups` helper (zero behavior change, proven via regression tests), then build the new `findPatternMatchedClusters` on top of it by partitioning signals by pattern key before windowing. A new nested route exposes it, computed live from `store.signals`, same as the existing correlation endpoint.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-09-pattern-matched-signal-correlation-design.md`

## Global Constraints

- Pattern key is `(side, severity, market)` — `market` via the existing `isTotalsSignal` classifier from `arena.ts`, not a new classifier. `signalType` is deliberately excluded (already a deterministic function of `severity`).
- Same `CORRELATION_WINDOW_MS` (5 minutes) and same 2-or-more-distinct-`matchId` requirement as the existing feature.
- The extraction of `sessionWindowGroups` must be 100% behavior-preserving for `findSignalClusters` — verified by running its existing tests unchanged after the refactor, not rewriting them.
- New route is `GET /api/signal-correlation/patterns`, nested under the existing correlation route — not a field added to the existing endpoint's response.
- No dashboard panel — backend-only, matching the established pattern for read-derived features.
- No change to the existing `GET /api/signal-correlation` endpoint's response shape or behavior.
- Test runner: Vitest, run from `apps/api/` via `npm run test`.
- This repo's docs (`PROJECT_STATE.md`, `TECHNICAL_DOCS.md`, `README.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged.

---

### Task 1: Extract `sessionWindowGroups` (regression-safe refactor)

**Files:**
- Modify: `apps/api/src/logic/signalCorrelation.ts`
- Modify: `apps/api/src/logic/signalCorrelation.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sessionWindowGroups<T>(items: T[], getTimestamp: (item: T) => string, windowMs: number): T[][]` — consumed by Task 2's `findPatternMatchedClusters` and (after this task) `findSignalClusters` itself.

- [ ] **Step 1: Write the failing tests for the extracted helper**

In `apps/api/src/logic/signalCorrelation.test.ts`, add this import to the
existing import line — find:

```typescript
import { findSignalClusters } from "./signalCorrelation";
```

Replace with:

```typescript
import { findSignalClusters, sessionWindowGroups } from "./signalCorrelation";
```

Then add this new `describe` block at the end of the file:

```typescript

describe("sessionWindowGroups", () => {
  type TimedItem = { id: string; ts: string };

  it("groups items within the window into a single group", () => {
    const items: TimedItem[] = [
      { id: "a", ts: iso(0) },
      { id: "b", ts: iso(60) },
    ];

    const groups = sessionWindowGroups(items, (item) => item.ts, 300000);

    expect(groups).toHaveLength(1);
    expect(groups[0].map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("chains gaps each individually under the window into one group", () => {
    const items: TimedItem[] = [
      { id: "a", ts: iso(0) },
      { id: "b", ts: iso(240) },
      { id: "c", ts: iso(480) },
    ];

    const groups = sessionWindowGroups(items, (item) => item.ts, 300000);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("splits into separate groups when a gap exceeds the window", () => {
    const items: TimedItem[] = [
      { id: "a", ts: iso(0) },
      { id: "b", ts: iso(400) },
    ];

    const groups = sessionWindowGroups(items, (item) => item.ts, 300000);

    expect(groups).toHaveLength(2);
    expect(groups[0].map((item) => item.id)).toEqual(["a"]);
    expect(groups[1].map((item) => item.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/signalCorrelation.test.ts
```

Expected: FAIL — `sessionWindowGroups` is not exported from
`./signalCorrelation` yet.

- [ ] **Step 3: Extract the helper and refactor `findSignalClusters` to use it**

In `apps/api/src/logic/signalCorrelation.ts`, find:

```typescript
export function findSignalClusters(
  signals: AgentSignal[],
  windowMs: number
): SignalCluster[] {
  const sorted = [...signals].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const groups: AgentSignal[][] = [];
  let current: AgentSignal[] = [];

  for (const signal of sorted) {
    if (current.length === 0) {
      current = [signal];
      continue;
    }

    const lastSignal = current[current.length - 1];
    const gapMs =
      new Date(signal.createdAt).getTime() - new Date(lastSignal.createdAt).getTime();

    if (gapMs <= windowMs) {
      current.push(signal);
    } else {
      groups.push(current);
      current = [signal];
    }
  }

  if (current.length > 0) groups.push(current);

  return groups
    .filter((group) => new Set(group.map((signal) => signal.matchId)).size >= 2)
    .map(buildCluster);
}
```

Replace with:

```typescript
/**
 * Generic session-windowing: sorts items by timestamp, then starts a new
 * group whenever the gap to the previous item in the current group
 * exceeds windowMs. Shared by findSignalClusters (any signals close in
 * time across matches) and findPatternMatchedClusters (only signals
 * sharing the same side/severity/market, so the "same pattern repeating"
 * question can reuse the exact same windowing algorithm).
 */
export function sessionWindowGroups<T>(
  items: T[],
  getTimestamp: (item: T) => string,
  windowMs: number
): T[][] {
  const sorted = [...items].sort(
    (a, b) => new Date(getTimestamp(a)).getTime() - new Date(getTimestamp(b)).getTime()
  );

  const groups: T[][] = [];
  let current: T[] = [];

  for (const item of sorted) {
    if (current.length === 0) {
      current = [item];
      continue;
    }

    const lastItem = current[current.length - 1];
    const gapMs =
      new Date(getTimestamp(item)).getTime() - new Date(getTimestamp(lastItem)).getTime();

    if (gapMs <= windowMs) {
      current.push(item);
    } else {
      groups.push(current);
      current = [item];
    }
  }

  if (current.length > 0) groups.push(current);

  return groups;
}

export function findSignalClusters(
  signals: AgentSignal[],
  windowMs: number
): SignalCluster[] {
  const groups = sessionWindowGroups(signals, (signal) => signal.createdAt, windowMs);

  return groups
    .filter((group) => new Set(group.map((signal) => signal.matchId)).size >= 2)
    .map(buildCluster);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/signalCorrelation.test.ts
```

Expected: PASS, all tests green — including every pre-existing
`findSignalClusters` test unchanged, confirming the refactor is 100%
behavior-preserving.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/signalCorrelation.ts apps/api/src/logic/signalCorrelation.test.ts
git commit -m "Extract sessionWindowGroups helper from findSignalClusters"
```

---

### Task 2: `findPatternMatchedClusters`

**Files:**
- Modify: `apps/api/src/logic/signalCorrelation.ts`
- Modify: `apps/api/src/logic/signalCorrelation.test.ts`

**Interfaces:**
- Consumes: `sessionWindowGroups` (Task 1, same file); `isTotalsSignal(signal): boolean` (existing, `./arena`).
- Produces: `PatternCluster` interface; `findPatternMatchedClusters(signals: AgentSignal[], windowMs: number): PatternCluster[]` — consumed by Task 3 (`server.ts`).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/logic/signalCorrelation.test.ts`, add this import to the
existing import line — find:

```typescript
import { findSignalClusters, sessionWindowGroups } from "./signalCorrelation";
```

Replace with:

```typescript
import {
  findPatternMatchedClusters,
  findSignalClusters,
  sessionWindowGroups,
} from "./signalCorrelation";
```

Then add this new `describe` block at the end of the file:

```typescript

describe("findPatternMatchedClusters", () => {
  it("does not report a cluster when only one match shares the pattern", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-1", createdAt: iso(60), side: "home", severity: "HIGH" }),
    ];

    expect(findPatternMatchedClusters(signals, 300000)).toEqual([]);
  });

  it("reports a genuine 2-match pattern cluster within the window", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60), side: "home", severity: "HIGH" }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual({
      side: "home",
      severity: "HIGH",
      market: "1x2",
      matchIds: ["match-1", "match-2"],
      matchCount: 2,
      signalCount: 2,
      windowStart: iso(0),
      windowEnd: iso(60),
      spanMs: 60000,
      signalIds: ["s0", "s1"],
    });
  });

  it("evaluates two different patterns in the same window independently, only reporting the one reaching 2+ matches", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(90), side: "away", severity: "LOW" }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].side).toBe("home");
    expect(clusters[0].severity).toBe("HIGH");
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
  });

  it("keeps 1x2 and totals signals separate even when side and severity match", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "match-1",
        createdAt: iso(0),
        side: "home",
        severity: "HIGH",
        target: "Team A",
      }),
      makeSignal({
        id: "s1",
        matchId: "match-2",
        createdAt: iso(60),
        side: "home",
        severity: "HIGH",
        target: "Over 3.5",
      }),
    ];

    expect(findPatternMatchedClusters(signals, 300000)).toEqual([]);
  });

  it("chains gaps into one cluster when all signals share the same pattern", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(240), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(480), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s3", matchId: "match-2", createdAt: iso(720), side: "home", severity: "HIGH" }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
    expect(clusters[0].signalCount).toBe(4);
    expect(clusters[0].spanMs).toBe(720000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/signalCorrelation.test.ts
```

Expected: FAIL — `findPatternMatchedClusters` is not exported from
`./signalCorrelation` yet.

- [ ] **Step 3: Write the implementation**

In `apps/api/src/logic/signalCorrelation.ts`, find the existing import
line:

```typescript
import type { AgentSignal, Severity } from "../types";
```

Replace with:

```typescript
import type { AgentSignal, Severity } from "../types";
import { isTotalsSignal } from "./arena";
```

Then find the end of the file (after `findSignalClusters`, which Task 1
already updated to use `sessionWindowGroups`) and add:

```typescript

export interface PatternCluster {
  side: "home" | "away";
  severity: Severity;
  market: "1x2" | "totals";
  matchIds: string[];
  matchCount: number;
  signalCount: number;
  windowStart: string;
  windowEnd: string;
  spanMs: number;
  signalIds: string[];
}

function computePatternKey(signal: AgentSignal): string {
  const market = isTotalsSignal(signal) ? "totals" : "1x2";
  return `${signal.side}|${signal.severity}|${market}`;
}

function buildPatternCluster(group: AgentSignal[]): PatternCluster {
  const first = group[0];
  const matchIds: string[] = [];
  const seenMatchIds = new Set<string>();

  for (const signal of group) {
    if (!seenMatchIds.has(signal.matchId)) {
      seenMatchIds.add(signal.matchId);
      matchIds.push(signal.matchId);
    }
  }

  const windowStart = group[0].createdAt;
  const windowEnd = group[group.length - 1].createdAt;

  return {
    side: first.side,
    severity: first.severity,
    market: isTotalsSignal(first) ? "totals" : "1x2",
    matchIds,
    matchCount: matchIds.length,
    signalCount: group.length,
    windowStart,
    windowEnd,
    spanMs: new Date(windowEnd).getTime() - new Date(windowStart).getTime(),
    signalIds: group.map((signal) => signal.id),
  };
}

/**
 * Stricter than findSignalClusters: only reports a cluster when the SAME
 * pattern (side + severity + market) repeats across 2+ distinct matches
 * within the window, rather than any signals firing close together
 * regardless of what they say. Partitions signals by pattern key first,
 * then reuses the exact same session-windowing algorithm independently
 * within each partition - two different patterns overlapping in time are
 * evaluated completely separately, each only reported if it independently
 * reaches 2+ matches on its own.
 */
export function findPatternMatchedClusters(
  signals: AgentSignal[],
  windowMs: number
): PatternCluster[] {
  const byPatternKey = new Map<string, AgentSignal[]>();

  for (const signal of signals) {
    const key = computePatternKey(signal);
    const existing = byPatternKey.get(key) ?? [];
    existing.push(signal);
    byPatternKey.set(key, existing);
  }

  const clusters: PatternCluster[] = [];

  for (const group of byPatternKey.values()) {
    const windows = sessionWindowGroups(group, (signal) => signal.createdAt, windowMs);

    for (const window of windows) {
      if (new Set(window.map((signal) => signal.matchId)).size >= 2) {
        clusters.push(buildPatternCluster(window));
      }
    }
  }

  return clusters.sort(
    (a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime()
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/signalCorrelation.test.ts
```

Expected: PASS, all tests green (existing tests plus the 3 new
`sessionWindowGroups` tests plus the 5 new `findPatternMatchedClusters`
tests).

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/logic/signalCorrelation.ts apps/api/src/logic/signalCorrelation.test.ts
git commit -m "Add pattern-matched signal correlation across simultaneous matches"
```

---

### Task 3: Register `GET /api/signal-correlation/patterns` in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `findPatternMatchedClusters` (Task 2, `./logic/signalCorrelation`); `CORRELATION_WINDOW_MS` (existing, same import already present).
- Produces: the live `GET /api/signal-correlation/patterns` route, consumed by Task 4 (openapi.yaml documentation).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, find:

```typescript
import { findSignalClusters, CORRELATION_WINDOW_MS } from "./logic/signalCorrelation";
```

Replace with:

```typescript
import {
  findPatternMatchedClusters,
  findSignalClusters,
  CORRELATION_WINDOW_MS,
} from "./logic/signalCorrelation";
```

- [ ] **Step 2: Add the route**

Find this exact block (the `GET /api/signal-correlation` route):

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

app.get("/api/signal-correlation/patterns", (_req, res) => {
  const clusters = findPatternMatchedClusters(store.signals, CORRELATION_WINDOW_MS);

  res.json({
    data: clusters,
    summary: {
      signalsScanned: store.signals.length,
      patternClustersDetected: clusters.length,
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

Expected: all test files pass, total test count higher than the
pre-existing 166.

- [ ] **Step 5: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`, checking port
availability first via `netstat -ano | grep ":4000.*LISTENING"` and
preferring an alternate port like `PORT=4110 npm run dev` if occupied by
something not yours), then in another terminal:

```bash
curl -s "http://localhost:4110/api/signal-correlation/patterns" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log(JSON.stringify(body, null, 2));
});
"
```

Expected: a `data` array (possibly empty, depending on what signals have
accumulated this session) and a `summary` with `signalsScanned` and
`patternClustersDetected`. If any pattern clusters exist, each should show
a single consistent `side`/`severity`/`market` across all its `matchIds`.
Stop the dev server afterward by finding its PID via
`netstat -ano | grep ":4110.*LISTENING"`, confirming the command line via
`Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'`, then stopping
that exact PID.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Register GET /api/signal-correlation/patterns route"
```

---

### Task 4: Document in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: the route from Task 3 (documents actual behavior; no code dependency).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the path**

Find this exact block (the end of the `/api/signal-correlation` path,
right before `/api/signal-performance`):

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

  /api/signal-correlation/patterns:
    get:
      summary: Pattern-matched cross-match signal correlation clusters
      description: >
        Stricter than GET /api/signal-correlation: only reports a cluster
        when the same pattern (side + severity + market type) repeats
        across 2 or more distinct matches within the same 5-minute
        session-window, rather than any signals firing close together
        regardless of what they say. signalType is not part of the
        pattern key - it is already a deterministic function of severity.
      responses:
        '200':
          description: Currently detected pattern-matched clusters, plus a scan summary.
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
                        side: { type: string, enum: [home, away] }
                        severity: { type: string, enum: [HIGH, MEDIUM, LOW] }
                        market: { type: string, enum: ['1x2', totals] }
                        matchIds:
                          type: array
                          items: { type: string }
                        matchCount: { type: number }
                        signalCount: { type: number }
                        windowStart: { type: string, format: date-time }
                        windowEnd: { type: string, format: date-time }
                        spanMs: { type: number }
                        signalIds:
                          type: array
                          items: { type: string }
                      required: [side, severity, market, matchIds, matchCount, signalCount, windowStart, windowEnd, spanMs, signalIds]
                  summary:
                    type: object
                    properties:
                      signalsScanned: { type: number }
                      patternClustersDetected: { type: number }
                    required: [signalsScanned, patternClustersDetected]
                required: [data, summary]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/signal-performance:
```

- [ ] **Step 2: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same
pre-existing cosmetic warnings as before, plus 1 (no new errors).

- [ ] **Step 3: Commit**

```bash
git add openapi.yaml
git commit -m "Document GET /api/signal-correlation/patterns in openapi.yaml"
```

---

### Task 5: Final verification and docs update

**Files:**
- Modify: `PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4 (this task only verifies and documents; no new production code).
- Produces: nothing further — this is the last task in the plan.

- [ ] **Step 1: Run the full test suite**

```bash
cd apps/api && npm run test
```

Expected: all test files pass. Note the exact new total test count (was
166 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`, extend the existing "Signal Correlation Across
Simultaneous Matches" section with a new paragraph describing
`findPatternMatchedClusters`/`GET /api/signal-correlation/patterns`: the
pattern-key definition (side/severity/market, why signalType is
excluded), the partition-then-window algorithm, and the shared
`sessionWindowGroups` extraction. Reference the spec:
`docs/superpowers/specs/2026-07-09-pattern-matched-signal-correlation-design.md`.

In `SUBMISSION_NOTES.md`, add a new numbered entry under "Major Features
Added This Session" (continuing from "12. Signal Archive Dashboard
Panel" if that's the last entry, or whatever the current last number is)
describing this feature, including the real architectural distinction
from the existing correlation feature as a genuine design decision worth
mentioning.

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`:
- Add `GET /api/signal-correlation/patterns (pattern-matched cross-match
  clusters: same side/severity/market repeating across matches)` to the
  API Endpoints list, right after the existing `GET /api/signal-correlation`
  entry.
- Update the automated-test-count line to the real number measured in
  Step 1.

In `PROJECT_STATE.md`:
- Add a new dated entry describing this feature: the pattern-key
  definition, the `sessionWindowGroups` extraction and why it was safe
  (regression-tested), the new endpoint, and the deliberate architectural
  distinction from the existing `GET /api/signal-correlation`.
- Update the route count and test count/file references to match Step 1's
  real numbers.
- Update the handoff status block per the standing update-cadence
  instruction.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document pattern-matched signal correlation across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the
entire branch's diff (all 5 tasks' commits together) before merging to
`main` — do not merge without it.
