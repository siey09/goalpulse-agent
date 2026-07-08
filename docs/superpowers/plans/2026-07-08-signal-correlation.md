# Signal Correlation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/signal-correlation`, detecting when signals fire across 2+ distinct matches close together in time — a distinct, cross-match pattern the existing signal engine (which only ever reasons about one match) has no visibility into.

**Architecture:** A new pure module, `logic/signalCorrelation.ts`, groups the entire stored signal history via session-windowing (a new group starts whenever the gap to the previous signal in the group exceeds 5 minutes), then filters to groups spanning 2+ distinct `matchId`s. `server.ts` wires it into one new route — read-only, computed live, never mutates `agent.ts`/`store.ts`'s state.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-signal-correlation-design.md`

## Global Constraints

- `CORRELATION_WINDOW_MS = 5 * 60 * 1000` — reuses the same "short window" constant already established twice this session (`feedHealth.ts`'s `ODDS_STALE_THRESHOLD_MS`, `steamDetection.ts`'s `STEAM_WINDOW_MS`).
- Session-windowing over the **entire** stored signal history, not just the trailing run (unlike steam detection) — `store.signals` can span hours even at its 100-entry cap, and multiple distinct clusters at different points in that history are all reported.
- A group only counts as a cluster if it spans 2+ distinct `matchId`s — a single match firing multiple signals in a row is normal, already-covered behavior, not cross-match correlation.
- No severity/signal-type filtering to join a cluster — mixed-severity clusters are valid and reported with a `severityBreakdown` so the consumer judges significance themselves.
- New route is a public GET, no API key, covered by the existing general rate limiter.
- Test runner: Vitest, run from `apps/api/` via `npm run test` (or `npx vitest run <path>` for a single file).
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged.

---

### Task 1: `findSignalClusters` in `logic/signalCorrelation.ts`

**Files:**
- Create: `apps/api/src/logic/signalCorrelation.ts`
- Create: `apps/api/src/logic/signalCorrelation.test.ts`

**Interfaces:**
- Consumes: `AgentSignal`, `Severity` (existing, `../types`).
- Produces: `SignalCluster` type, `findSignalClusters(signals: AgentSignal[], windowMs: number): SignalCluster[]`, `CORRELATION_WINDOW_MS` constant — all consumed by Task 2 (`server.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/logic/signalCorrelation.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { findSignalClusters } from "./signalCorrelation";
import type { AgentSignal } from "../types";

const BASE_TIME = new Date("2026-07-08T14:00:00.000Z").getTime();

function iso(secondsFromStart: number): string {
  return new Date(BASE_TIME + secondsFromStart * 1000).toISOString();
}

function makeSignal(overrides: Partial<AgentSignal> = {}): AgentSignal {
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
    createdAt: iso(0),
    resultStatus: "pending",
    ...overrides,
  };
}

describe("findSignalClusters", () => {
  it("does not report a cluster when all signals are from the same single match", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-1", createdAt: iso(60) }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(120) }),
    ];

    expect(findSignalClusters(signals, 300000)).toEqual([]);
  });

  it("does not report a cluster when different matches are too far apart in time", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(400) }),
    ];

    expect(findSignalClusters(signals, 300000)).toEqual([]);
  });

  it("reports a genuine 2-match cluster within the window", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60) }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual({
      matchIds: ["match-1", "match-2"],
      matchCount: 2,
      signalCount: 2,
      severityBreakdown: { high: 2, medium: 0, low: 0 },
      windowStart: iso(0),
      windowEnd: iso(60),
      spanMs: 60000,
      signalIds: ["s0", "s1"],
    });
  });

  it("chains gaps each individually under the window into one cluster spanning longer than the window", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(240) }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(480) }),
      makeSignal({ id: "s3", matchId: "match-2", createdAt: iso(720) }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
    expect(clusters[0].signalCount).toBe(4);
    expect(clusters[0].spanMs).toBe(720000);
  });

  it("identifies two separate clusters when an idle gap exceeds the window between them", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60) }),
      makeSignal({ id: "s2", matchId: "match-3", createdAt: iso(460) }),
      makeSignal({ id: "s3", matchId: "match-4", createdAt: iso(520) }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(2);
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
    expect(clusters[1].matchIds).toEqual(["match-3", "match-4"]);
  });

  it("counts a mixed-severity cluster's severityBreakdown correctly", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60), severity: "MEDIUM" }),
      makeSignal({ id: "s2", matchId: "match-2", createdAt: iso(120), severity: "LOW" }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].severityBreakdown).toEqual({ high: 1, medium: 1, low: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/signalCorrelation.test.ts
```

Expected: FAIL — `Cannot find module './signalCorrelation'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/logic/signalCorrelation.ts`:

```typescript
import type { AgentSignal, Severity } from "../types";

export const CORRELATION_WINDOW_MS = 5 * 60 * 1000;

export interface SignalCluster {
  matchIds: string[];
  matchCount: number;
  signalCount: number;
  severityBreakdown: { high: number; medium: number; low: number };
  windowStart: string;
  windowEnd: string;
  spanMs: number;
  signalIds: string[];
}

function severityKey(severity: Severity): "high" | "medium" | "low" | null {
  if (severity === "HIGH") return "high";
  if (severity === "MEDIUM") return "medium";
  if (severity === "LOW") return "low";
  return null;
}

function buildCluster(group: AgentSignal[]): SignalCluster {
  const matchIds: string[] = [];
  const seenMatchIds = new Set<string>();
  const severityBreakdown = { high: 0, medium: 0, low: 0 };

  for (const signal of group) {
    if (!seenMatchIds.has(signal.matchId)) {
      seenMatchIds.add(signal.matchId);
      matchIds.push(signal.matchId);
    }

    const key = severityKey(signal.severity);
    if (key) severityBreakdown[key] += 1;
  }

  const windowStart = group[0].createdAt;
  const windowEnd = group[group.length - 1].createdAt;

  return {
    matchIds,
    matchCount: matchIds.length,
    signalCount: group.length,
    severityBreakdown,
    windowStart,
    windowEnd,
    spanMs: new Date(windowEnd).getTime() - new Date(windowStart).getTime(),
    signalIds: group.map((signal) => signal.id),
  };
}

/**
 * Groups the entire stored signal history via session-windowing: sorted by
 * createdAt, a new group starts whenever the gap to the previous signal in
 * the current group exceeds windowMs. A steady trickle of correlated
 * signals can therefore span longer than windowMs in total, as long as no
 * single gap between consecutive signals exceeds it. Only groups spanning
 * 2+ distinct matchIds are reported - a single match firing multiple
 * signals in a row is normal, already-covered signal-engine behavior, not
 * cross-match correlation.
 */
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

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/signalCorrelation.test.ts
```

Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/signalCorrelation.ts apps/api/src/logic/signalCorrelation.test.ts
git commit -m "Add pure signal correlation detection across simultaneous matches"
```

---

### Task 2: Register `GET /api/signal-correlation` in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `findSignalClusters`, `CORRELATION_WINDOW_MS` (Task 1, `./logic/signalCorrelation`).
- Produces: the live `GET /api/signal-correlation` route, consumed by Task 3 (openapi.yaml documentation).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, add this import line right after the existing `import { detectSteamMove } from "./logic/steamDetection";` / `import type { SteamMove } from "./logic/steamDetection";` lines:

```typescript
import { findSignalClusters, CORRELATION_WINDOW_MS } from "./logic/signalCorrelation";
```

- [ ] **Step 2: Add the route**

Find this exact block in `apps/api/src/server.ts` (the end of the `GET /api/steam-moves` route):

```typescript
  res.json({
    data: steamMoves,
    summary: {
      matchesScanned: snapshotsByMatchId.size,
      steamMovesDetected: steamMoves.length,
    },
  });
});
```

Add this new route immediately after it:

```typescript
  res.json({
    data: steamMoves,
    summary: {
      matchesScanned: snapshotsByMatchId.size,
      steamMovesDetected: steamMoves.length,
    },
  });
});

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

- [ ] **Step 3: Verify the project builds**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no type errors.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass, total test count higher than the pre-existing 126.

- [ ] **Step 5: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`), then in another terminal:

```bash
curl -s "http://localhost:4000/api/signal-correlation" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log('summary:', JSON.stringify(body.summary, null, 2));
  console.log('data:', JSON.stringify(body.data, null, 2));
});
"
```

Expected: `summary.signalsScanned` equals `store.signals.length` at that moment, and `summary.clustersDetected` equals `body.data.length`. Given the simulated feed's short polling interval, multiple matches often generate signals close together — a nonzero `clustersDetected` is a plausible, expected result here, but an empty `data: []` is equally valid if the simulated signals haven't happened to overlap across matches yet.

Stop the dev server afterward by finding its PID (`netstat -ano | grep ":4000.*LISTENING"` on Windows), confirming via its command line that it's the one you started, and killing that exact PID; prefer an alternate port (e.g. `PORT=4050 npm run dev`) if port 4000 is already occupied by something you didn't start.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Register GET /api/signal-correlation route"
```

---

### Task 3: Document `GET /api/signal-correlation` in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: the route from Task 2 (documents actual behavior; no code dependency).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the path**

Find this exact block (the end of the `/api/steam-moves` path, right before `/api/onchain/validate-stat`):

```yaml
                  summary:
                    type: object
                    properties:
                      matchesScanned: { type: number }
                      steamMovesDetected: { type: number }
                    required: [matchesScanned, steamMovesDetected]
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
                      matchesScanned: { type: number }
                      steamMovesDetected: { type: number }
                    required: [matchesScanned, steamMovesDetected]
                required: [data, summary]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/signal-correlation:
    get:
      summary: Cross-match signal correlation clusters
      description: >
        Groups the entire stored signal history via session-windowing (a
        new group starts whenever the gap between two consecutive signals
        exceeds 5 minutes), then reports only groups spanning 2 or more
        distinct matches - a single match firing multiple signals in a row
        is normal signal-engine behavior, not cross-match correlation. No
        severity or signal-type filtering is applied to join a cluster;
        each cluster reports a severity breakdown so significance can be
        judged directly.
      responses:
        '200':
          description: Currently detected cross-match signal clusters, plus a scan summary.
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
                        matchIds:
                          type: array
                          items: { type: string }
                        matchCount: { type: number }
                        signalCount: { type: number }
                        severityBreakdown:
                          type: object
                          properties:
                            high: { type: number }
                            medium: { type: number }
                            low: { type: number }
                          required: [high, medium, low]
                        windowStart: { type: string, format: date-time }
                        windowEnd: { type: string, format: date-time }
                        spanMs: { type: number }
                        signalIds:
                          type: array
                          items: { type: string }
                      required: [matchIds, matchCount, signalCount, severityBreakdown, windowStart, windowEnd, spanMs, signalIds]
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

- [ ] **Step 2: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same pre-existing cosmetic `operationId` warnings as before (no new errors).

- [ ] **Step 3: Commit**

```bash
git add openapi.yaml
git commit -m "Document GET /api/signal-correlation in openapi.yaml"
```

---

### Task 4: Final verification and docs update

**Files:**
- Modify: `PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`

**Interfaces:**
- Consumes: everything from Tasks 1-3 (this task only verifies and documents; no new production code).
- Produces: nothing further — this is the last task in the plan.

- [ ] **Step 1: Run the full test suite**

```bash
cd apps/api && npm run test
```

Expected: all test files pass. Note the exact new total test count (was 126 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`, add a new section (after "Steam Move Detection") describing signal correlation: the session-windowing grouping rule, the 2+ distinct match requirement, and the new endpoint. Add `logic/signalCorrelation.ts` to the "Important backend files" list.

In `SUBMISSION_NOTES.md`, add a matching entry under "Major Features Added This Session" (numbered continuing from the existing "7. Steam Move Detection" entry) describing the same feature in the narrative style already used there.

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`:
- Add `GET /api/signal-correlation (cross-match signal cluster detection)` to the API Endpoints list, right after `GET /api/steam-moves`.
- Update the automated-test-count line to the real number measured in Step 1.

In `PROJECT_STATE.md`:
- Add a new dated entry describing this feature (spec/plan file paths, the session-windowing rule, the 2+ match requirement).
- Update the "20 backend routes total" count to 21 and add `/api/signal-correlation` to the route list.
- Update the test file list/count to match Step 1's real number, including `logic/signalCorrelation.test.ts` in the file list.
- Update the handoff status block per the standing update-cadence instruction: mark #6 done, move to #7.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document signal correlation across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the entire branch's diff (all 4 tasks' commits together) before merging to `main` — do not merge without it.
