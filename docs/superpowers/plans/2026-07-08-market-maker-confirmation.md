# Market Maker Double-Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/market-maker/confirmations`, which cross-checks every stored signal against an independently-computed "band breach" test: did the move actually break through what the Market Maker's own model, computed from the snapshot *before* the move, considered normal quoting uncertainty at the time.

**Architecture:** A new pure module, `logic/marketConfirmation.ts`, composes the existing `computeMarketMakerQuote` (`marketMaker.ts`) with signal data — kept as a separate module so the quoting model and this cross-check layer stay single-responsibility. `server.ts` wires it into one new route, following the same combined-map lookup pattern the `/api/arena` route already uses for matches/snapshots.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-market-maker-confirmation-design.md`

## Global Constraints

- The cross-check is genuinely independent of the signal's own severity classification: it does not re-derive anything from `fieldPressureScore`/`reliability` directly — it compares the *previous* snapshot's Market Maker quote against the *current* signal's actual odds.
- `bandBreached = signal.oddsAfter < previousQuote.bidOdds[signal.side]` — compression always means the winning side's odds got shorter, so the old bid (the quote's lower bound) is the direction-consistent boundary to test against.
- Applies to both 1X2 and Over/Under totals signals — no exclusion, unlike Arena's Contrarian agent (which needs an opposing side's real team name; this check only needs the same side's own historical band).
- A signal whose previous snapshot has aged out of the shared 800-entry `oddsSnapshots` cache, or whose match can't be found, is silently skipped — not included in `data` or counted in `summary.totalChecked`.
- New route is a public GET, no API key, covered by the existing general rate limiter — same as every other GET route.
- Computed live at request time from `store.signals`/`store.oddsSnapshots`/`store.matches`/`store.recentFinishedMatches` — never touches `agent.ts`/`store.ts`'s mutable state.
- Test runner: Vitest, run from `apps/api/` via `npm run test` (or `npx vitest run <path>` for a single file).
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged.

---

### Task 1: `assessBandBreach` / `summarizeBandBreaches` in `logic/marketConfirmation.ts`

**Files:**
- Create: `apps/api/src/logic/marketConfirmation.ts`
- Create: `apps/api/src/logic/marketConfirmation.test.ts`

**Interfaces:**
- Consumes: `computeMarketMakerQuote` (existing, `./marketMaker`); `AgentSignal`, `Match`, `OddsSnapshot`, `Severity`, `TeamSide` (existing, `../types`).
- Produces: `BandBreachResult`, `BandBreachSummary` types; `assessBandBreach(signal, match, previousSnapshot)`, `summarizeBandBreaches(results)` — both consumed by Task 2 (`server.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/logic/marketConfirmation.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { assessBandBreach, summarizeBandBreaches } from "./marketConfirmation";
import type { BandBreachResult } from "./marketConfirmation";
import type { AgentSignal, Match, OddsSnapshot } from "../types";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "World Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    status: "live",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snap-prev",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 3.0,
    drawOdds: 3.25,
    homeScore: 0,
    awayScore: 0,
    minute: 40,
    source: "txline",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
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
    oddsAfter: 1.9,
    oddsChangePct: 5,
    momentumScore: 50,
    explanation: "test",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

function makeResult(overrides: Partial<BandBreachResult> = {}): BandBreachResult {
  return {
    signalId: "signal-1",
    matchId: "match-1",
    match: "Team A vs Team B",
    side: "home",
    severity: "HIGH",
    oddsBefore: 2.0,
    oddsAfter: 1.9,
    previousBandBid: 1.98,
    previousBandAsk: 2.02,
    bandBreached: false,
    ...overrides,
  };
}

describe("assessBandBreach", () => {
  it("flags a band breach when the home side's current odds fall below the previous quote's bid", () => {
    const match = makeMatch();
    const previousSnapshot = makeSnapshot({ homeOdds: 2.0 });
    const signal = makeSignal({ side: "home", oddsAfter: 1.9 });

    const result = assessBandBreach(signal, match, previousSnapshot);

    expect(result.bandBreached).toBe(true);
    expect(result.previousBandBid).toBe(1.98);
    expect(result.previousBandAsk).toBe(2.02);
  });

  it("does not flag a breach when the current odds stay within the previous quote's band", () => {
    const match = makeMatch();
    const previousSnapshot = makeSnapshot({ homeOdds: 2.0 });
    const signal = makeSignal({ side: "home", oddsAfter: 1.99 });

    const result = assessBandBreach(signal, match, previousSnapshot);

    expect(result.bandBreached).toBe(false);
  });

  it("checks the away side's band when the signal side is away", () => {
    const match = makeMatch();
    const previousSnapshot = makeSnapshot({ awayOdds: 3.0 });
    const signal = makeSignal({ side: "away", oddsAfter: 2.9, target: "Team B" });

    const result = assessBandBreach(signal, match, previousSnapshot);

    expect(result.bandBreached).toBe(true);
    expect(result.previousBandBid).toBe(2.97);
    expect(result.previousBandAsk).toBe(3.03);
  });

  it("carries through the signal's own identifying fields", () => {
    const match = makeMatch();
    const previousSnapshot = makeSnapshot();
    const signal = makeSignal({
      id: "signal-42",
      matchId: "match-9",
      match: "X vs Y",
      side: "home",
      severity: "MEDIUM",
      oddsBefore: 2.5,
      oddsAfter: 2.0,
    });

    const result = assessBandBreach(signal, match, previousSnapshot);

    expect(result.signalId).toBe("signal-42");
    expect(result.matchId).toBe("match-9");
    expect(result.match).toBe("X vs Y");
    expect(result.severity).toBe("MEDIUM");
    expect(result.oddsBefore).toBe(2.5);
    expect(result.oddsAfter).toBe(2.0);
  });
});

describe("summarizeBandBreaches", () => {
  it("returns zero counts and 0% rate for an empty list", () => {
    expect(summarizeBandBreaches([])).toEqual({
      totalChecked: 0,
      confirmedCount: 0,
      unconfirmedCount: 0,
      confirmationRatePct: 0,
    });
  });

  it("counts confirmed vs unconfirmed and computes the rate", () => {
    const results = [
      makeResult({ bandBreached: true }),
      makeResult({ bandBreached: true }),
      makeResult({ bandBreached: false }),
      makeResult({ bandBreached: false }),
    ];

    expect(summarizeBandBreaches(results)).toEqual({
      totalChecked: 4,
      confirmedCount: 2,
      unconfirmedCount: 2,
      confirmationRatePct: 50,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/marketConfirmation.test.ts
```

Expected: FAIL — `Cannot find module './marketConfirmation'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/logic/marketConfirmation.ts`:

```typescript
import { computeMarketMakerQuote } from "./marketMaker";
import type { AgentSignal, Match, OddsSnapshot, Severity, TeamSide } from "../types";

export interface BandBreachResult {
  signalId: string;
  matchId: string;
  match: string;
  side: TeamSide;
  severity: Severity;
  oddsBefore: number;
  oddsAfter: number;
  previousBandBid: number;
  previousBandAsk: number;
  bandBreached: boolean;
}

/**
 * Genuinely independent cross-check against the signal's own severity
 * classification: computes what the Market Maker would have quoted using
 * the snapshot from before the move, then checks whether the move's actual
 * post-move odds broke through that old quote's bid (its lower bound) for
 * the signal's side. Compression always means the winning side's odds got
 * shorter, so breaching the old bid is the direction-consistent test - a
 * move that outpaced the market's own prior uncertainty allowance, not
 * just a restatement of the same fieldPressureScore that already feeds
 * both this quote and the signal's own momentum score.
 */
export function assessBandBreach(
  signal: AgentSignal,
  match: Match,
  previousSnapshot: OddsSnapshot
): BandBreachResult {
  const previousQuote = computeMarketMakerQuote(match, previousSnapshot);
  const previousBandBid = previousQuote.bidOdds[signal.side];
  const previousBandAsk = previousQuote.askOdds[signal.side];

  return {
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: signal.side,
    severity: signal.severity,
    oddsBefore: signal.oddsBefore,
    oddsAfter: signal.oddsAfter,
    previousBandBid,
    previousBandAsk,
    bandBreached: signal.oddsAfter < previousBandBid,
  };
}

export interface BandBreachSummary {
  totalChecked: number;
  confirmedCount: number;
  unconfirmedCount: number;
  confirmationRatePct: number;
}

export function summarizeBandBreaches(results: BandBreachResult[]): BandBreachSummary {
  const confirmedCount = results.filter((result) => result.bandBreached).length;
  const unconfirmedCount = results.length - confirmedCount;
  const confirmationRatePct =
    results.length > 0 ? Math.round((confirmedCount / results.length) * 100) : 0;

  return {
    totalChecked: results.length,
    confirmedCount,
    unconfirmedCount,
    confirmationRatePct,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/marketConfirmation.test.ts
```

Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/marketConfirmation.ts apps/api/src/logic/marketConfirmation.test.ts
git commit -m "Add pure market maker band-breach cross-check functions"
```

---

### Task 2: Register `GET /api/market-maker/confirmations` in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `assessBandBreach`, `summarizeBandBreaches`, `BandBreachResult` (Task 1, `./logic/marketConfirmation`).
- Produces: the live `GET /api/market-maker/confirmations` route, consumed by Task 3 (openapi.yaml documentation).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, add this import line right after the existing `import { parseArchiveFilters, parsePageParam, parsePageSizeParam } from "./logic/paginationParams";` line:

```typescript
import { assessBandBreach, summarizeBandBreaches } from "./logic/marketConfirmation";
import type { BandBreachResult } from "./logic/marketConfirmation";
```

- [ ] **Step 2: Add the route**

Find this exact block in `apps/api/src/server.ts` (the end of the `GET /api/feed-health` route):

```typescript
app.get("/api/feed-health", (_req, res) => {
  const now = Date.now();

  const cycleHealth = assessCycleHealth(store.agentRuns, now, config.agentIntervalMs);
  const oddsFreshness = assessOddsFreshness(
    store.matches,
    store.oddsSnapshots,
    now,
    ODDS_STALE_THRESHOLD_MS
  );
  const fixtureCoverage = assessFixtureCoverage(store.agentRuns);
  const status = computeFeedHealthStatus(cycleHealth, oddsFreshness, fixtureCoverage);

  res.json({
    data: {
      status,
      cycleHealth,
      oddsFreshness,
      fixtureCoverage,
    },
  });
});
```

Add this new route immediately after it:

```typescript
app.get("/api/feed-health", (_req, res) => {
  const now = Date.now();

  const cycleHealth = assessCycleHealth(store.agentRuns, now, config.agentIntervalMs);
  const oddsFreshness = assessOddsFreshness(
    store.matches,
    store.oddsSnapshots,
    now,
    ODDS_STALE_THRESHOLD_MS
  );
  const fixtureCoverage = assessFixtureCoverage(store.agentRuns);
  const status = computeFeedHealthStatus(cycleHealth, oddsFreshness, fixtureCoverage);

  res.json({
    data: {
      status,
      cycleHealth,
      oddsFreshness,
      fixtureCoverage,
    },
  });
});

app.get("/api/market-maker/confirmations", (_req, res) => {
  const matchesById = new Map<string, (typeof store.matches)[number]>();

  for (const match of store.recentFinishedMatches) {
    matchesById.set(match.id, match);
  }
  for (const match of store.matches) {
    matchesById.set(match.id, match);
  }

  const snapshotsById = new Map<string, (typeof store.oddsSnapshots)[number]>();
  for (const snapshot of store.oddsSnapshots) {
    snapshotsById.set(snapshot.id, snapshot);
  }

  const results: BandBreachResult[] = [];

  for (const signal of store.signals) {
    const previousSnapshotId = signal.evidence?.previousSnapshotId;
    const previousSnapshot = previousSnapshotId
      ? snapshotsById.get(previousSnapshotId)
      : undefined;
    const match = matchesById.get(signal.matchId);

    if (!previousSnapshot || !match) continue;

    results.push(assessBandBreach(signal, match, previousSnapshot));
  }

  res.json({
    data: results,
    summary: summarizeBandBreaches(results),
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

Expected: all test files pass, total test count higher than the pre-existing 113.

- [ ] **Step 5: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`), then in another terminal:

```bash
curl -s "http://localhost:4000/api/market-maker/confirmations" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log('summary:', JSON.stringify(body.summary, null, 2));
  console.log('first result:', JSON.stringify(body.data[0], null, 2));
});
"
```

Expected: `summary.totalChecked` equals `body.data.length`, and `confirmedCount + unconfirmedCount === totalChecked`. If any signals exist yet in this dev session's simulated feed, the first result's `bandBreached` should be consistent with whether `oddsAfter < previousBandBid` for that entry (spot-check by eye).

Stop the dev server afterward by finding its PID (`netstat -ano | grep ":4000.*LISTENING"` on Windows) and killing that exact PID — confirm via the process's command line that it's the one you started before stopping it (this repo has a history of stray leftover dev-server processes from other sessions on this machine); prefer an alternate port (e.g. `PORT=4030 npm run dev`) if port 4000 is already occupied by something you didn't start.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Register GET /api/market-maker/confirmations route"
```

---

### Task 3: Document `GET /api/market-maker/confirmations` in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: the route from Task 2 (documents actual behavior; no code dependency).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the path**

Find this exact block (the end of the `/api/feed-health` path, right before `/api/onchain/validate-stat`):

```yaml
                      fixtureCoverage:
                        type: object
                        properties:
                          lastRunRawFixtureCount: { type: number, nullable: true }
                          lastRunProcessedCount: { type: number, nullable: true }
                          isCoverageDropped: { type: boolean }
                          recentCoverageDrops: { type: number }
                        required: [lastRunRawFixtureCount, lastRunProcessedCount, isCoverageDropped, recentCoverageDrops]
                    required: [status, cycleHealth, oddsFreshness, fixtureCoverage]
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/onchain/validate-stat:
```

Replace with:

```yaml
                      fixtureCoverage:
                        type: object
                        properties:
                          lastRunRawFixtureCount: { type: number, nullable: true }
                          lastRunProcessedCount: { type: number, nullable: true }
                          isCoverageDropped: { type: boolean }
                          recentCoverageDrops: { type: number }
                        required: [lastRunRawFixtureCount, lastRunProcessedCount, isCoverageDropped, recentCoverageDrops]
                    required: [status, cycleHealth, oddsFreshness, fixtureCoverage]
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/market-maker/confirmations:
    get:
      summary: Market Maker double-confirmation cross-check
      description: >
        For each stored signal, computes what the Market Maker would have
        quoted using the snapshot from before the move, then reports whether
        the move's actual post-move odds broke through that old quote's bid
        for the signal's side - a genuinely independent corroboration
        signal, not a restatement of the same fieldPressureScore that
        already feeds both the quote and the signal's own momentum score.
        Signals whose previous snapshot has aged out of the shared
        800-entry cache are silently skipped.
      responses:
        '200':
          description: Band-breach results for every computable signal, plus an aggregate summary.
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
                        signalId: { type: string }
                        matchId: { type: string }
                        match: { type: string }
                        side: { type: string }
                        severity: { type: string }
                        oddsBefore: { type: number }
                        oddsAfter: { type: number }
                        previousBandBid: { type: number }
                        previousBandAsk: { type: number }
                        bandBreached: { type: boolean }
                      required: [signalId, matchId, match, side, severity, oddsBefore, oddsAfter, previousBandBid, previousBandAsk, bandBreached]
                  summary:
                    type: object
                    properties:
                      totalChecked: { type: number }
                      confirmedCount: { type: number }
                      unconfirmedCount: { type: number }
                      confirmationRatePct: { type: number }
                    required: [totalChecked, confirmedCount, unconfirmedCount, confirmationRatePct]
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
git commit -m "Document GET /api/market-maker/confirmations in openapi.yaml"
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

Expected: all test files pass. Note the exact new total test count (was 113 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`, add a new section (after the "Feed Health / Data-Quality Monitoring" section) describing the band-breach cross-check: what it computes, why it's genuinely independent rather than circular, and the new endpoint. Add `logic/marketConfirmation.ts` to the "Important backend files" list.

In `SUBMISSION_NOTES.md`, add a matching entry under "Major Features Added This Session" (numbered continuing from the existing "5. Feed Health / Data-Quality Monitoring" entry) describing the same cross-check in the narrative style already used there.

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`:
- Add `GET /api/market-maker/confirmations (band-breach cross-check against each signal's own severity)` to the API Endpoints list, right after `GET /api/feed-health`.
- Update the automated-test-count line to the real number measured in Step 1.

In `PROJECT_STATE.md`:
- Add a new dated entry describing this feature (spec/plan file paths, the band-breach test, and the "genuinely independent, not circular" framing).
- Update the "18 backend routes total" count to 19 and add `/api/market-maker/confirmations` to the route list.
- Update the test file list/count to match Step 1's real number, including `logic/marketConfirmation.test.ts` in the file list.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document Market Maker double-confirmation cross-check across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the entire branch's diff (all 4 tasks' commits together) before merging to `main` — do not merge without it.
