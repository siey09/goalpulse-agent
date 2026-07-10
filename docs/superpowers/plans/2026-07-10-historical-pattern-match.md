# Historical Pattern Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a signal the user is viewing, find and surface how similar past signals (same `signalType`, ranked by closeness on `oddsChangePct`/`fieldPressureScore`, excluding the signal's own match, capped per other match) resolved historically — new backend logic + endpoint, new section in the existing signal detail modal.

**Architecture:** New pure logic module (`logic/historicalPatternMatch.ts`) computes ranked similar signals from already-fetched `ArchiveEntry[]`, matching the established pattern of every other archive-backed feature this session. A new permissive query-param parser (`parseSimilarSignalsParams`, placed in the existing `paginationParams.ts`) feeds it from a new `GET /api/archive/similar-signals` route, computed fresh per request (no caching). The frontend fetches this on-demand when the existing `selectedSignal` detail modal opens and renders a new "Similar past signals" section as the modal's last block.

**Tech Stack:** Backend: Node/Express/TypeScript, Vitest. Frontend: React/TypeScript. No new dependencies anywhere.

## Global Constraints

- No new dependencies (per spec).
- Backend query-param parsing must degrade gracefully on invalid/missing input (return empty/default, never throw) — matching `parsePageParam`/`parsePageSizeParam`/`parseArchiveFilters` in `apps/api/src/logic/paginationParams.ts`.
- `signalType` is a hard filter; `oddsChangePct`/`fieldPressureScore` are ranking-only. `fieldPressureScore` only contributes to distance when **both** the target and the candidate have it.
- Own-match exclusion and per-match capping use `baseMatchId` (`matchId.split("-totals-")[0]`), matching the existing convention in `signalPerformance.ts`.
- `apps/web/tsconfig.app.json` has `noUnusedLocals`/`noUnusedParameters` — any frontend helper/local introduced must be consumed within the same task.
- Verify backend with `npm run test` (`vitest run`) and `npm run build` (`tsc`) from `apps/api`; verify frontend with `npm run build` (`tsc -b && vite build`) from `apps/web`.

---

### Task 1: `historicalPatternMatch.ts` logic module

**Files:**
- Create: `apps/api/src/logic/historicalPatternMatch.ts`
- Create: `apps/api/src/logic/historicalPatternMatch.test.ts`

**Interfaces:**
- Consumes: `ArchiveEntry` from `apps/api/src/types.ts` (existing).
- Produces: `SimilarSignalsParams`, `SimilarSignalEntry`, `SimilarSignalsResult` types and `findSimilarSignals(entries: ArchiveEntry[], target: SimilarSignalsParams): SimilarSignalsResult` — consumed by Task 3's route handler.

- [ ] **Step 1: Write the failing test file**

Create `apps/api/src/logic/historicalPatternMatch.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { findSimilarSignals } from "./historicalPatternMatch";
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
    oddsChangePct: 20,
    momentumScore: 50,
    explanation: "test",
    createdAt: new Date().toISOString(),
    resultStatus: "correct",
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

describe("findSimilarSignals", () => {
  it("returns the empty result for no entries", () => {
    expect(findSimilarSignals([], { signalType: "SHARP_MOVE" })).toEqual({
      count: 0,
      correctCount: 0,
      incorrectCount: 0,
      accuracyPct: 0,
      signals: [],
    });
  });

  it("returns the empty result when signalType is missing from the target", () => {
    const entries = [makeEntry()];
    expect(findSimilarSignals(entries, {})).toEqual({
      count: 0,
      correctCount: 0,
      incorrectCount: 0,
      accuracyPct: 0,
      signals: [],
    });
  });

  it("excludes entries with a different signalType", () => {
    const entries = [
      makeEntry({ matchId: "m1", signalType: "SHARP_MOVE" }),
      makeEntry({ matchId: "m2", signalType: "WATCH" }),
    ];

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE" });

    expect(result.count).toBe(1);
    expect(result.signals[0].matchId).toBe("m1");
  });

  it("excludes pending entries", () => {
    const entries = [
      makeEntry({ matchId: "m1", resultStatus: "pending" }),
      makeEntry({ matchId: "m2", resultStatus: "correct" }),
    ];

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE" });

    expect(result.count).toBe(1);
    expect(result.signals[0].matchId).toBe("m2");
  });

  it("excludes entries from the target's own match, including the totals-suffix form", () => {
    const entries = [
      makeEntry({ matchId: "18209181", signalType: "SHARP_MOVE" }),
      makeEntry({ matchId: "18209181-totals-2.5", signalType: "SHARP_MOVE" }),
      makeEntry({ matchId: "18218149", signalType: "SHARP_MOVE" }),
    ];

    const result = findSimilarSignals(entries, {
      signalType: "SHARP_MOVE",
      excludeMatchId: "18209181-totals-3.5",
    });

    expect(result.count).toBe(1);
    expect(result.signals[0].matchId).toBe("18218149");
  });

  it("caps each other match to its 2 closest entries and ranks across matches by distance", () => {
    const entries = [
      makeEntry({ matchId: "match-x", oddsChangePct: 20, resultStatus: "correct" }),
      makeEntry({ matchId: "match-x", oddsChangePct: 22, resultStatus: "correct" }),
      makeEntry({ matchId: "match-x", oddsChangePct: 30, resultStatus: "incorrect" }),
      makeEntry({ matchId: "match-y", oddsChangePct: 21, resultStatus: "incorrect" }),
    ];

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE", oddsChangePct: 20 });

    expect(result.signals.map((s) => `${s.matchId}:${s.oddsChangePct}`)).toEqual([
      "match-x:20",
      "match-y:21",
      "match-x:22",
    ]);
    expect(result.count).toBe(3);
    expect(result.correctCount).toBe(2);
    expect(result.incorrectCount).toBe(1);
    expect(result.accuracyPct).toBe(67);
  });

  it("caps the overall result at 5 entries, keeping the closest", () => {
    const entries = [0, 30, 60, 90, 120, 150].map((oddsChangePct, index) =>
      makeEntry({ matchId: `m${index}`, oddsChangePct })
    );

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE", oddsChangePct: 0 });

    expect(result.count).toBe(5);
    expect(result.signals.map((s) => s.matchId)).not.toContain("m5");
  });

  it("only factors fieldPressureScore into ranking when both target and candidate have it", () => {
    const entries = [
      makeEntry({
        matchId: "match-a",
        oddsChangePct: 20,
        signalData: makeAgentSignal({
          evidence: { source: "txline", scoresContext: { fieldPressureScore: 10 } },
        }),
      }),
      makeEntry({
        matchId: "match-b",
        oddsChangePct: 20,
        signalData: makeAgentSignal({
          evidence: { source: "txline", scoresContext: { fieldPressureScore: 40 } },
        }),
      }),
      makeEntry({
        matchId: "match-c",
        oddsChangePct: 25,
        signalData: makeAgentSignal({ evidence: { source: "txline" } }),
      }),
    ];

    const result = findSimilarSignals(entries, {
      signalType: "SHARP_MOVE",
      oddsChangePct: 20,
      fieldPressureScore: 10,
    });

    expect(result.signals.map((s) => s.matchId)).toEqual(["match-a", "match-c", "match-b"]);
  });

  it("carries fieldPressureScore, severity, and archivedAt through to each returned entry", () => {
    const entries = [
      makeEntry({
        matchId: "m1",
        severity: "HIGH",
        archivedAt: "2026-07-01T00:00:00.000Z",
        signalData: makeAgentSignal({
          evidence: { source: "txline", scoresContext: { fieldPressureScore: 30 } },
        }),
      }),
    ];

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE" });

    expect(result.signals[0]).toEqual({
      matchId: "m1",
      signalType: "SHARP_MOVE",
      severity: "HIGH",
      oddsChangePct: 20,
      fieldPressureScore: 30,
      resultStatus: "correct",
      archivedAt: "2026-07-01T00:00:00.000Z",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/api`: `npm run test -- historicalPatternMatch`
Expected: FAIL — `Cannot find module './historicalPatternMatch'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `historicalPatternMatch.ts`**

Create `apps/api/src/logic/historicalPatternMatch.ts`:

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

/**
 * A totals signal's matchId is `<fixtureId>-totals-<line>` (see
 * isTotalsMatchId in archive.ts) - collapsing to the base fixture id keeps
 * one real match's several totals lines from being treated as distinct
 * matches, matching signalPerformance.ts's existing baseMatchId.
 */
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

- [ ] **Step 4: Run the tests to verify they pass**

Run from `apps/api`: `npm run test -- historicalPatternMatch`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/historicalPatternMatch.ts apps/api/src/logic/historicalPatternMatch.test.ts
git commit -m "Add historicalPatternMatch logic module with tests"
```

---

### Task 2: `parseSimilarSignalsParams` query-param parser

**Files:**
- Modify: `apps/api/src/logic/paginationParams.ts`
- Modify: `apps/api/src/logic/paginationParams.test.ts`

**Interfaces:**
- Consumes: `SimilarSignalsParams` type from `./historicalPatternMatch` (Task 1).
- Produces: `parseSimilarSignalsParams(query: Record<string, unknown>): SimilarSignalsParams` — consumed by Task 3's route handler.

- [ ] **Step 1: Add failing tests to `paginationParams.test.ts`**

Append to `apps/api/src/logic/paginationParams.test.ts` (add the import and the new `describe` block):

```typescript
import { describe, expect, it } from "vitest";
import {
  parsePageParam,
  parsePageSizeParam,
  parseArchiveFilters,
  parseSimilarSignalsParams,
} from "./paginationParams";
```

(Replace the existing import line with the one above — same file, just adding `parseSimilarSignalsParams` to the existing named imports.)

Add this new `describe` block at the end of the file:

```typescript

describe("parseSimilarSignalsParams", () => {
  it("returns an empty object when no recognized query params are present", () => {
    expect(parseSimilarSignalsParams({})).toEqual({});
  });

  it("includes signalType only when it is a non-empty string", () => {
    expect(parseSimilarSignalsParams({ signalType: "SHARP_MOVE" })).toEqual({
      signalType: "SHARP_MOVE",
    });
    expect(parseSimilarSignalsParams({ signalType: "" })).toEqual({});
    expect(parseSimilarSignalsParams({ signalType: undefined })).toEqual({});
  });

  it("includes oddsChangePct only when it parses to a finite number", () => {
    expect(parseSimilarSignalsParams({ oddsChangePct: "20.5" })).toEqual({ oddsChangePct: 20.5 });
    expect(parseSimilarSignalsParams({ oddsChangePct: "not-a-number" })).toEqual({});
    expect(parseSimilarSignalsParams({ oddsChangePct: undefined })).toEqual({});
  });

  it("includes fieldPressureScore only when it parses to a finite number", () => {
    expect(parseSimilarSignalsParams({ fieldPressureScore: "12" })).toEqual({ fieldPressureScore: 12 });
    expect(parseSimilarSignalsParams({ fieldPressureScore: "bogus" })).toEqual({});
  });

  it("includes excludeMatchId only when it is a non-empty string", () => {
    expect(parseSimilarSignalsParams({ excludeMatchId: "match-1" })).toEqual({
      excludeMatchId: "match-1",
    });
    expect(parseSimilarSignalsParams({ excludeMatchId: "" })).toEqual({});
  });

  it("combines multiple valid params together", () => {
    expect(
      parseSimilarSignalsParams({
        signalType: "SHARP_MOVE",
        oddsChangePct: "20",
        fieldPressureScore: "10",
        excludeMatchId: "match-1",
      })
    ).toEqual({
      signalType: "SHARP_MOVE",
      oddsChangePct: 20,
      fieldPressureScore: 10,
      excludeMatchId: "match-1",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/api`: `npm run test -- paginationParams`
Expected: FAIL — `parseSimilarSignalsParams` is not exported from `./paginationParams`.

- [ ] **Step 3: Implement `parseSimilarSignalsParams`**

In `apps/api/src/logic/paginationParams.ts`, add the import and the new function:

```typescript
import type { ArchiveFilters } from "../types";
import type { SimilarSignalsParams } from "./historicalPatternMatch";
```

(Replace the existing single-line `import type { ArchiveFilters } from "../types";` with both lines above.)

Append this function at the end of the file:

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

- [ ] **Step 4: Run the tests to verify they pass**

Run from `apps/api`: `npm run test -- paginationParams`
Expected: PASS, all tests green (existing `parsePageParam`/`parsePageSizeParam`/`parseArchiveFilters` tests plus the new `parseSimilarSignalsParams` tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/paginationParams.ts apps/api/src/logic/paginationParams.test.ts
git commit -m "Add parseSimilarSignalsParams query-param parser with tests"
```

---

### Task 3: Wire the `/api/archive/similar-signals` route and document it

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: `findSimilarSignals` (Task 1), `parseSimilarSignalsParams` (Task 2), existing `getArchivedSignals` from `./services/archive` (already imported in `server.ts`).
- Produces: `GET /api/archive/similar-signals` — consumed by Task 4's frontend fetch.

- [ ] **Step 1: Add the imports**

In `apps/api/src/server.ts`, find this existing import line:

```typescript
import { parseArchiveFilters, parsePageParam, parsePageSizeParam } from "./logic/paginationParams";
```

Replace with:

```typescript
import {
  parseArchiveFilters,
  parsePageParam,
  parsePageSizeParam,
  parseSimilarSignalsParams,
} from "./logic/paginationParams";
import { findSimilarSignals } from "./logic/historicalPatternMatch";
```

- [ ] **Step 2: Add the route**

Find the existing `/api/archive` route in `apps/api/src/server.ts`:

```typescript
app.get("/api/archive", async (req, res) => {
  const page = parsePageParam(req.query.page);
  const pageSize = parsePageSizeParam(req.query.pageSize);
  const filters = parseArchiveFilters(req.query as Record<string, unknown>);

  const result = await getArchivedSignals(filters, { page, pageSize });

  res.json(result);
});
```

Add this new route immediately after it:

```typescript

app.get("/api/archive/similar-signals", async (req, res) => {
  const params = parseSimilarSignalsParams(req.query as Record<string, unknown>);
  const result = await getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 });
  const similar = findSimilarSignals(result.data, params);

  res.json({ data: similar });
});
```

- [ ] **Step 3: Verify backend build and full test suite**

Run from `apps/api`: `npm run build && npm run test`
Expected: build succeeds, all tests pass (198 total: 189 existing + 9 from Task 1 — Task 2's tests were added to the existing `paginationParams.test.ts` file, not a new file).

- [ ] **Step 4: Add the OpenAPI doc entry**

In `openapi.yaml`, find the end of the existing `/api/archive` entry (ends with the `'429': $ref: '#/components/responses/RateLimited'` line right before the blank line and `/api/feed-health:` entry). Insert this new entry between them:

```yaml

  /api/archive/similar-signals:
    get:
      summary: Historical precedent for a signal, ranked by similarity
      description: >
        Given a target signal's own signalType/oddsChangePct/
        fieldPressureScore (passed as query params, not looked up by id),
        finds settled archive entries of the same signalType, ranked by
        closeness on oddsChangePct and (when both sides have it)
        fieldPressureScore. Excludes the target's own match (via
        excludeMatchId, collapsing the "-totals-" suffix) and caps each
        other match to its 2 closest entries so one repeatedly-firing
        match can't dominate the comparison set. Returns the closest 5
        overall. Computed fresh per request, no caching. Fail-open:
        returns 200 with an empty result if Supabase is unconfigured or
        signalType is missing/invalid, inherited from GET /api/archive's
        own fail-open behavior.
      parameters:
        - name: signalType
          in: query
          required: false
          schema:
            type: string
          description: Hard filter. Missing or empty returns an empty result.
        - name: oddsChangePct
          in: query
          required: false
          schema:
            type: number
          description: Ranking dimension. Invalid/missing values simply drop this term from the ranking distance.
        - name: fieldPressureScore
          in: query
          required: false
          schema:
            type: number
          description: Ranking dimension, only applied when the candidate also has a fieldPressureScore. Invalid/missing values drop this term.
        - name: excludeMatchId
          in: query
          required: false
          schema:
            type: string
          description: The target signal's own matchId, excluded from results (base fixture id, collapsing the totals-line suffix).
      responses:
        '200':
          description: Ranked similar signals and an aggregate outcome summary, always 200 (fail-open).
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: object
                    properties:
                      count: { type: number }
                      correctCount: { type: number }
                      incorrectCount: { type: number }
                      accuracyPct: { type: number }
                      signals:
                        type: array
                        items:
                          type: object
                          properties:
                            matchId: { type: string }
                            signalType: { type: string }
                            severity: { type: string }
                            oddsChangePct: { type: number }
                            fieldPressureScore: { type: number }
                            resultStatus: { type: string, enum: [correct, incorrect] }
                            archivedAt: { type: string, format: date-time }
                          required: [matchId, signalType, severity, oddsChangePct, resultStatus, archivedAt]
                    required: [count, correctCount, incorrectCount, accuracyPct, signals]
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'
```

- [ ] **Step 5: Validate the OpenAPI doc**

Run from the repo root: `npx @redocly/cli lint openapi.yaml`
Expected: no new errors introduced by this change (pre-existing warnings, if any, are unrelated and untouched).

- [ ] **Step 6: Manual local endpoint check**

Run `npm run dev:once` from `apps/api` in one terminal (or use the already-configured local dev flow), then in another terminal:

```bash
curl "http://localhost:3000/api/archive/similar-signals?signalType=SHARP_MOVE&oddsChangePct=20"
```

Expected: a `200` JSON response with a `data` object containing `count`/`correctCount`/`incorrectCount`/`accuracyPct`/`signals` (values depend on local Supabase config — an empty result with `count: 0` is expected and correct if Supabase isn't configured locally, matching every other archive-backed endpoint's fail-open behavior). Confirm no 500/crash.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/server.ts openapi.yaml
git commit -m "Wire GET /api/archive/similar-signals route and document it"
```

---

### Task 4: Frontend — fetch, state, and the "Similar past signals" section

**Files:**
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/archive/similar-signals` (Task 3), existing `selectedSignal` state, existing `getSignalType()`/`formatTime()`/`API_BASE_URL`/`request()` helpers, existing `AgentSignal` type (already has `evidence.scoresContext.fieldPressureScore` and `matchId`/`oddsChangePct` from prior work this session).
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Add the response type and state**

Find the `selectedSignal` state declaration in `App.tsx` (`const [selectedSignal, setSelectedSignal] = useState<AgentSignal | null>(null);`). Immediately after it, add:

```typescript
  const [similarSignals, setSimilarSignals] = useState<SimilarSignalsResult | null>(null);
  const [isSimilarSignalsLoading, setIsSimilarSignalsLoading] = useState(false);
```

Near the top of the file, alongside the other local type declarations (e.g. right after the `AgentSignal` type), add:

```typescript
type SimilarSignalEntry = {
  matchId?: string;
  signalType?: string;
  severity?: string;
  oddsChangePct?: number;
  fieldPressureScore?: number;
  resultStatus?: "correct" | "incorrect";
  archivedAt?: string;
};

type SimilarSignalsResult = {
  count: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
  signals: SimilarSignalEntry[];
};
```

- [ ] **Step 2: Add the fetch effect**

Immediately after the `useEffect` that manages the odds SSE stream (the one keyed on `[selectedMatchId, isReplayStreamMode]`, ending around where `stream.close()` is called), add a new effect:

```typescript
  useEffect(() => {
    if (!selectedSignal) {
      setSimilarSignals(null);
      return;
    }

    let cancelled = false;
    setIsSimilarSignalsLoading(true);

    const params = new URLSearchParams();
    params.set("signalType", getSignalType(selectedSignal));
    if (typeof selectedSignal.oddsChangePct === "number") {
      params.set("oddsChangePct", String(selectedSignal.oddsChangePct));
    }
    const fieldPressureScore = selectedSignal.evidence?.scoresContext?.fieldPressureScore;
    if (typeof fieldPressureScore === "number") {
      params.set("fieldPressureScore", String(fieldPressureScore));
    }
    if (selectedSignal.matchId) {
      params.set("excludeMatchId", selectedSignal.matchId);
    }

    fetch(`${API_BASE_URL}/api/archive/similar-signals?${params.toString()}`)
      .then((response) => response.json())
      .then((payload: { data?: SimilarSignalsResult }) => {
        if (cancelled) return;
        setSimilarSignals(payload.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setSimilarSignals(null);
      })
      .finally(() => {
        if (!cancelled) setIsSimilarSignalsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSignal]);
```

- [ ] **Step 3: Add the "Similar past signals" section**

Do not build yet — `similarSignals` is write-only (via `setSimilarSignals`) until this step adds the render code that reads it. `noUnusedLocals` would fail an intermediate build between Step 2 and this step, so treat Steps 1-3 as one atomic edit before building.

Find the end of the "Decision path" block in the `selectedSignal` modal (`App.tsx`, the `<ol>` block ending with step 6 "Evaluation status", followed by `</div>` then `</div>` then `</div>` then `)}` then `</main>`):

```tsx
                <li>
                  6. Evaluation status:{" "}
                  <span className="font-semibold text-emerald-200">
                    {getSignalOutcome(selectedSignal)}
                  </span>.
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
```

Insert a new section between the closing `</ol>` block's wrapping `</div>` and the modal's outer closing `</div>`:

```tsx
                <li>
                  6. Evaluation status:{" "}
                  <span className="font-semibold text-emerald-200">
                    {getSignalOutcome(selectedSignal)}
                  </span>.
                </li>
              </ol>
            </div>

            <div className="mt-4 rounded-2xl border border-sky-400/15 bg-sky-400/5 p-4">
              <p className="text-[11px] text-sky-200/80">Historical precedent</p>
              <h3 className="mt-1 text-sm font-semibold text-white">Similar past signals</h3>

              {isSimilarSignalsLoading ? (
                <p className="mt-3 text-xs text-stone-400">Checking historical precedent...</p>
              ) : !similarSignals || similarSignals.count < 3 ? (
                <p className="mt-3 text-xs text-stone-400">Not enough similar past signals yet.</p>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-5 text-stone-300">
                    {similarSignals.correctCount} of {similarSignals.count} similar past signals
                    resolved correct ({similarSignals.accuracyPct}%).
                  </p>

                  <div className="mt-3 space-y-2">
                    {similarSignals.signals.map((entry, index) => (
                      <div
                        key={`${entry.matchId ?? "match"}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-black/25 p-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-stone-100">
                            Match {entry.matchId ?? "Unknown"}
                          </p>
                          <p className="mt-0.5 text-stone-500">
                            {formatOddsChange(entry.oddsChangePct)} compression ·{" "}
                            {entry.fieldPressureScore != null
                              ? `${entry.fieldPressureScore} field pressure`
                              : "no field pressure"}{" "}
                            · {formatTime(entry.archivedAt)}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            entry.resultStatus === "correct"
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                              : "border-red-400/30 bg-red-400/10 text-red-200"
                          }`}
                        >
                          {(entry.resultStatus ?? "unknown").toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 5: Manual dev check**

Run `npm run dev` in `apps/web`, open the app, click any signal to open its detail modal. Confirm:
- A "Similar past signals" section renders at the bottom of the modal.
- It shows either "Checking historical precedent..." briefly, then either "Not enough similar past signals yet." or the summary line + a list of match/compression/field-pressure/outcome rows.
- No console errors.
- Closing and reopening the modal on a different signal shows fresh (not stale) data.

Stop the dev server after checking (exact PID, not pattern-kill).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Add Similar past signals section to the signal detail modal"
```

---

## Final Verification

- [ ] Run `npm run test && npm run build` from `apps/api` — full backend suite green, clean build.
- [ ] Run `npm run build` from `apps/web` — clean build.
- [ ] Run `npx @redocly/cli lint openapi.yaml` from the repo root — no new errors.
- [ ] Manual end-to-end check in the dev browser: open a signal detail modal, confirm the new section renders correctly for both the small-sample and populated cases (if production data doesn't currently have 3+ qualifying signals for any given open signal, the small-sample message alone is sufficient confirmation — do not fabricate data to force the populated case).
- [ ] Report the full diff to the user for review — do not push until they explicitly say to.
