# Confidence-Bucketed Signal Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/signal-performance/by-confidence`, bucketing settled archived signals by `confidenceScore` range and reporting accuracy per bucket — testing whether the composite score actually predicts outcomes better than `severity`/`signalType` alone.

**Architecture:** A new function alongside the existing `summarizeSignalTypePerformance` in `logic/signalPerformance.ts` (same domain, same archive-derived accuracy concern, different grouping key). A new nested route mirrors this session's established precedent for closely-related-but-distinct groupings.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-09-confidence-bucketed-performance-design.md`

## Global Constraints

- Buckets: `< 25` → `"0-25"`, `< 50` → `"25-50"`, `< 75` → `"50-75"`, else `"75-100"`. No defensive out-of-range clamping needed — `confidenceScore` is mathematically guaranteed to stay in `[0, 100]`.
- Entries without a `confidenceScore` are excluded entirely — confirmed this means **all 102 currently-settled archived signals** (every one predates item #7). This is expected; the endpoint will return `[]` today and fill in as new signals settle.
- `pending` entries are also explicitly excluded (defensive, matching `summarizeSignalTypePerformance`'s own redundant check even though its caller already filters `event: "settled"`).
- Empty buckets are omitted from the output entirely, not returned with a 0%/NaN placeholder.
- Buckets are returned in ascending order (`0-25` → `75-100`), unlike the signalType sibling function which has no natural order and returns insertion order.
- New route nested under `/api/signal-performance`, not a field added to the existing response.
- No dashboard change.
- Test runner: Vitest, run from `apps/api/` via `npm run test`.
- This repo's docs must reflect this feature once merged.

---

### Task 1: `summarizeConfidenceScorePerformance`

**Files:**
- Modify: `apps/api/src/logic/signalPerformance.ts`
- Modify: `apps/api/src/logic/signalPerformance.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ConfidenceBucketPerformance` interface; `summarizeConfidenceScorePerformance(entries: ArchiveEntry[]): ConfidenceBucketPerformance[]` — consumed by Task 2 (`server.ts`).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/logic/signalPerformance.test.ts`, find the existing
import line:

```typescript
import { summarizeSignalTypePerformance } from "./signalPerformance";
```

Replace with:

```typescript
import {
  summarizeConfidenceScorePerformance,
  summarizeSignalTypePerformance,
} from "./signalPerformance";
```

Then add this new `describe` block at the end of the file:

```typescript

describe("summarizeConfidenceScorePerformance", () => {
  it("returns an empty array for no entries", () => {
    expect(summarizeConfidenceScorePerformance([])).toEqual([]);
  });

  it("excludes entries without a confidenceScore", () => {
    const entries = [makeEntry({ signalId: "s0", resultStatus: "correct" })];

    expect(summarizeConfidenceScorePerformance(entries)).toEqual([]);
  });

  it("computes accuracy for a single bucket with mixed outcomes", () => {
    const entries = [
      makeEntry({
        signalId: "s0",
        resultStatus: "correct",
        signalData: makeAgentSignal({ confidenceScore: 30 }),
      }),
      makeEntry({
        signalId: "s1",
        resultStatus: "incorrect",
        signalData: makeAgentSignal({ confidenceScore: 40 }),
      }),
    ];

    const result = summarizeConfidenceScorePerformance(entries);

    expect(result).toEqual([
      { bucket: "25-50", settledCount: 2, correctCount: 1, incorrectCount: 1, accuracyPct: 50 },
    ]);
  });

  it("returns multiple buckets in ascending order regardless of input order", () => {
    const entries = [
      makeEntry({
        signalId: "s0",
        resultStatus: "correct",
        signalData: makeAgentSignal({ confidenceScore: 90 }),
      }),
      makeEntry({
        signalId: "s1",
        resultStatus: "correct",
        signalData: makeAgentSignal({ confidenceScore: 10 }),
      }),
    ];

    const result = summarizeConfidenceScorePerformance(entries);

    expect(result.map((r) => r.bucket)).toEqual(["0-25", "75-100"]);
  });

  it("places boundary values in the correct adjacent bucket", () => {
    const entries = [
      makeEntry({ signalId: "s0", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 24.9 }) }),
      makeEntry({ signalId: "s1", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 25.0 }) }),
      makeEntry({ signalId: "s2", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 49.9 }) }),
      makeEntry({ signalId: "s3", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 50.0 }) }),
      makeEntry({ signalId: "s4", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 74.9 }) }),
      makeEntry({ signalId: "s5", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 75.0 }) }),
    ];

    const result = summarizeConfidenceScorePerformance(entries);

    expect(result.map((r) => [r.bucket, r.settledCount])).toEqual([
      ["0-25", 1],
      ["25-50", 2],
      ["50-75", 2],
      ["75-100", 1],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/signalPerformance.test.ts
```

Expected: FAIL — `summarizeConfidenceScorePerformance` is not exported
from `./signalPerformance` yet.

- [ ] **Step 3: Write the implementation**

In `apps/api/src/logic/signalPerformance.ts`, add this at the end of the
file:

```typescript

export interface ConfidenceBucketPerformance {
  bucket: "0-25" | "25-50" | "50-75" | "75-100";
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
}

function confidenceBucket(score: number): ConfidenceBucketPerformance["bucket"] {
  if (score < 25) return "0-25";
  if (score < 50) return "25-50";
  if (score < 75) return "50-75";
  return "75-100";
}

const BUCKET_ORDER: ConfidenceBucketPerformance["bucket"][] = ["0-25", "25-50", "50-75", "75-100"];

/**
 * confidenceScore (item #7) was designed to be more informative than raw
 * severity/signalType - it blends field pressure and freshness into the
 * score - but nothing measured whether it actually predicts accuracy
 * better. Entries without a confidenceScore (all archived signals as of
 * 2026-07-09, which predate item #7 in the pipeline) are excluded
 * entirely - they carry no bucketed-accuracy information. Buckets with
 * zero settled entries are omitted, not returned with a 0%/NaN
 * placeholder.
 */
export function summarizeConfidenceScorePerformance(
  entries: ArchiveEntry[]
): ConfidenceBucketPerformance[] {
  const byBucket = new Map<string, ArchiveEntry[]>();

  for (const entry of entries) {
    if (entry.resultStatus === "pending") continue;

    const score = entry.signalData?.confidenceScore;
    if (typeof score !== "number") continue;

    const bucket = confidenceBucket(score);
    const existing = byBucket.get(bucket) ?? [];
    existing.push(entry);
    byBucket.set(bucket, existing);
  }

  return BUCKET_ORDER.filter((bucket) => byBucket.has(bucket)).map((bucket) => {
    const group = byBucket.get(bucket)!;
    const correctCount = group.filter((entry) => entry.resultStatus === "correct").length;
    const incorrectCount = group.length - correctCount;

    return {
      bucket,
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

Expected: PASS, all tests green (existing tests plus the 5 new ones).

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/logic/signalPerformance.ts apps/api/src/logic/signalPerformance.test.ts
git commit -m "Add confidence-bucketed signal performance aggregation"
```

---

### Task 2: Register `GET /api/signal-performance/by-confidence` in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `summarizeConfidenceScorePerformance` (Task 1, `./logic/signalPerformance`); `getArchivedSignals` (existing, already imported).
- Produces: the live route, consumed by Task 3 (openapi.yaml documentation).

- [ ] **Step 1: Add the import**

Find:

```typescript
import { summarizeSignalTypePerformance } from "./logic/signalPerformance";
```

Replace with:

```typescript
import {
  summarizeConfidenceScorePerformance,
  summarizeSignalTypePerformance,
} from "./logic/signalPerformance";
```

- [ ] **Step 2: Add the route**

Find:

```typescript
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

Add this new route immediately after it:

```typescript
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

app.get("/api/signal-performance/by-confidence", async (_req, res) => {
  const result = await getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 });
  const performance = summarizeConfidenceScorePerformance(result.data);

  res.json({
    data: performance,
    summary: {
      settledSignalsScanned: result.data.length,
      bucketsReported: performance.length,
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
pre-existing 176.

- [ ] **Step 5: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`, checking port
availability first via `netstat -ano | grep ":4000.*LISTENING"` and
preferring an alternate port like `PORT=4120 npm run dev` if occupied by
something not yours), then in another terminal:

```bash
curl -s "http://localhost:4120/api/signal-performance/by-confidence" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log(JSON.stringify(body, null, 2));
});
"
```

Expected: `data: []` and `summary: { settledSignalsScanned: <some
number>, bucketsReported: 0 }` — confirmed expected given no currently-
settled signal has a `confidenceScore` yet, not an error. Stop the dev
server afterward by finding its PID via
`netstat -ano | grep ":4120.*LISTENING"`, confirming the command line via
`Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'`, then stopping
that exact PID.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Register GET /api/signal-performance/by-confidence route"
```

---

### Task 3: Document and verify

**Files:**
- Modify: `openapi.yaml`, `PROJECT_STATE.md`, `TECHNICAL_DOCS.md`

**Interfaces:**
- Consumes: Task 2 (documents actual behavior; no code dependency).
- Produces: nothing further — this is the last task in the plan.

- [ ] **Step 1: Add the path to `openapi.yaml`**

Find this exact block (the end of the `/api/signal-performance` path,
right before `/api/arena/backtest`):

```yaml
                  summary:
                    type: object
                    properties:
                      settledSignalsScanned: { type: number }
                      signalTypesReported: { type: number }
                    required: [settledSignalsScanned, signalTypesReported]
                required: [data, summary]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/arena/backtest:
```

Replace with:

```yaml
                  summary:
                    type: object
                    properties:
                      settledSignalsScanned: { type: number }
                      signalTypesReported: { type: number }
                    required: [settledSignalsScanned, signalTypesReported]
                required: [data, summary]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/signal-performance/by-confidence:
    get:
      summary: Historical hit-rate bucketed by confidenceScore range
      description: >
        Stricter companion to GET /api/signal-performance: buckets settled
        archived signals by confidenceScore range (0-25/25-50/50-75/75-100)
        rather than signalType, testing whether the composite confidence
        score is more predictive of outcomes than raw severity alone.
        Entries without a confidenceScore are excluded entirely (as of
        2026-07-09, this includes every currently-settled archived signal,
        since all predate confidenceScore's introduction - the endpoint
        will return an empty array until newer signals settle). Fail-open:
        returns 200 with empty data if Supabase is unconfigured or
        unreachable, inherited from the existing GET /api/archive
        endpoint's own fail-open behavior.
      responses:
        '200':
          description: Historical accuracy per confidence bucket, plus a scan summary.
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
                        bucket: { type: string, enum: ['0-25', '25-50', '50-75', '75-100'] }
                        settledCount: { type: number }
                        correctCount: { type: number }
                        incorrectCount: { type: number }
                        accuracyPct: { type: number }
                      required: [bucket, settledCount, correctCount, incorrectCount, accuracyPct]
                  summary:
                    type: object
                    properties:
                      settledSignalsScanned: { type: number }
                      bucketsReported: { type: number }
                    required: [settledSignalsScanned, bucketsReported]
                required: [data, summary]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/arena/backtest:
```

- [ ] **Step 2: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same
pre-existing cosmetic warnings as before, plus 1 (no new errors).

- [ ] **Step 3: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 4: Update the docs**

In `TECHNICAL_DOCS.md`'s "Composite Confidence Score and Signal-Type
Performance" section, add a paragraph describing the new endpoint, the
bucket boundaries, and the confirmed-empty-today data gap and why it was
built anyway. Reference
`docs/superpowers/specs/2026-07-09-confidence-bucketed-performance-design.md`.

In `PROJECT_STATE.md`: add a brief dated entry (continuing the numbered
feature list, item 16) describing this feature and explicitly noting it
returns empty today by design, expected to fill in as remaining matches
settle. Update the test count and handoff status block.

- [ ] **Step 5: Commit**

```bash
git add openapi.yaml PROJECT_STATE.md TECHNICAL_DOCS.md
git commit -m "Document confidence-bucketed signal performance"
```

- [ ] **Step 6: Request final whole-branch review**

Per this repo's established convention, request a final review of the
entire branch's diff (all three tasks' commits together) before merging
to `main` — do not merge without it.
