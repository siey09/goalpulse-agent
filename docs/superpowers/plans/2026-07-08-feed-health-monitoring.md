# Feed Health / Data-Quality Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/feed-health`, a diagnostic report covering three feed-degradation checks (cycle health, odds freshness, fixture coverage) that are currently invisible — nothing today flags a stuck scheduler, a live match whose odds feed has gone quiet, or the 14-fixture cap silently dropping coverage.

**Architecture:** One small new field (`rawFixtureCount`) threaded through the existing feed-fetch → `AgentRun` pipeline (no new concept, just capturing a number that's already computed but discarded). A new pure module, `logic/feedHealth.ts`, analyzes already-stored data (`store.agentRuns`, `store.matches`, `store.oddsSnapshots`) with zero I/O. `server.ts` wires it into one new route.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-feed-health-monitoring-design.md`

## Global Constraints

- `store.agentRuns` is newest-first (existing `unshift` convention) — `agentRuns[0]` is the most recent run, and gaps are computed between adjacent pairs walking that order.
- Missed-cycle threshold: current gap or any historical gap `> 3x config.agentIntervalMs`.
- Odds staleness threshold: a fixed 5-minute (`300_000`ms) constant, independent of `agentIntervalMs` — not every cycle produces a new odds tick even when healthy.
- Fixture-coverage drop: `rawFixtureCount > matchesProcessed` on a given run — self-contained, never hardcodes the "14" cap constant.
- A live match with **no** odds snapshot at all is never counted as stale (nothing to compare against) — matches this codebase's existing precedent of not penalizing "no data" the same as "bad data" (see `marketMaker.ts`'s `UNKNOWN` reliability handling).
- Status derivation: `"down"` if the current cycle gap is exceeded (overrides everything else); else `"degraded"` if any of {historical missed cycles, stale live matches, coverage drop} is true; else `"healthy"`.
- New route is a public GET, no API key, covered by the existing general rate limiter — same as every other GET route.
- Test runner: Vitest, run from `apps/api/` via `npm run test` (or `npx vitest run <path>` for a single file).
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged.

---

### Task 1: Thread `rawFixtureCount` through the feed pipeline

**Files:**
- Modify: `apps/api/src/types.ts` (`AgentRun` interface)
- Modify: `apps/api/src/services/txlineClient.ts` (`TxLineFeedResult` interface, `fetchTxLineFeed()`)
- Modify: `apps/api/src/services/mockTxLine.ts` (`fetchSimulatedTxLineFeed()`)
- Modify: `apps/api/src/agent.ts` (`processAgentCycle()`, both the success and error `AgentRun` construction)

**Interfaces:**
- Consumes: nothing new (pure plumbing).
- Produces: `AgentRun.rawFixtureCount: number`, always populated — consumed by Task 2's `assessFixtureCoverage`.

- [ ] **Step 1: Add `rawFixtureCount` to `AgentRun`**

In `apps/api/src/types.ts`, find:

```typescript
export interface AgentRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  matchesProcessed: number;
  snapshotsCreated: number;
  signalsCreated: number;
  status: "success" | "error";
  message: string;
}
```

Replace with:

```typescript
export interface AgentRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  matchesProcessed: number;
  snapshotsCreated: number;
  signalsCreated: number;
  rawFixtureCount: number;
  status: "success" | "error";
  message: string;
}
```

- [ ] **Step 2: Add `rawFixtureCount` to `TxLineFeedResult` and populate it in `fetchTxLineFeed()`**

In `apps/api/src/services/txlineClient.ts`, find:

```typescript
export interface TxLineFeedResult {
  matches: Match[];
  snapshots: OddsSnapshot[];
}
```

Replace with:

```typescript
export interface TxLineFeedResult {
  matches: Match[];
  snapshots: OddsSnapshot[];
  rawFixtureCount?: number;
}
```

Then, in the same file, find the end of `fetchTxLineFeed()`:

```typescript
  console.log(
    `TxLINE feed normalized: ${matches.length} matches, ${normalizedSnapshots.length} snapshots with strongest movement evidence`
  );

  return {
    matches,
    snapshots: normalizedSnapshots,
  };
}
```

Replace with:

```typescript
  console.log(
    `TxLINE feed normalized: ${matches.length} matches, ${normalizedSnapshots.length} snapshots with strongest movement evidence`
  );

  return {
    matches,
    snapshots: normalizedSnapshots,
    rawFixtureCount: fixtures.length,
  };
}
```

(`fixtures` is the array fetched from `/api/fixtures/snapshot` earlier in this same function, *before* `prioritizeLikelyLiveFixtures(...).slice(0, 14)` — it is already in scope at this point.)

- [ ] **Step 3: Populate `rawFixtureCount` in the simulated feed**

In `apps/api/src/services/mockTxLine.ts`, find:

```typescript
export function fetchSimulatedTxLineFeed(): {
  matches: Match[];
  snapshots: OddsSnapshot[];
} {
```

Replace with:

```typescript
export function fetchSimulatedTxLineFeed(): {
  matches: Match[];
  snapshots: OddsSnapshot[];
  rawFixtureCount: number;
} {
```

Then find the end of the same function:

```typescript
  return {
    matches: updatedMatches,
    snapshots,
  };
```

Replace with:

```typescript
  return {
    matches: updatedMatches,
    snapshots,
    rawFixtureCount: updatedMatches.length,
  };
```

- [ ] **Step 4: Populate `AgentRun.rawFixtureCount` in `agent.ts`**

In `apps/api/src/agent.ts`, find the success-path `AgentRun` construction:

```typescript
    const run: AgentRun = {
      id: `run-${Date.now()}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      matchesProcessed: feed.matches.length,
      snapshotsCreated,
      signalsCreated,
      status: "success",
      message: `Processed ${feed.matches.length} matches, stored ${snapshotsCreated} new snapshot(s), generated ${signalsCreated} signal(s), and evaluated ${evaluatedSignals} pending signal(s).`,
    };
```

Replace with:

```typescript
    const run: AgentRun = {
      id: `run-${Date.now()}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      matchesProcessed: feed.matches.length,
      snapshotsCreated,
      signalsCreated,
      rawFixtureCount: feed.rawFixtureCount ?? feed.matches.length,
      status: "success",
      message: `Processed ${feed.matches.length} matches, stored ${snapshotsCreated} new snapshot(s), generated ${signalsCreated} signal(s), and evaluated ${evaluatedSignals} pending signal(s).`,
    };
```

Then find the error-path `AgentRun` construction:

```typescript
    const run: AgentRun = {
      id: `run-${Date.now()}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      matchesProcessed: 0,
      snapshotsCreated: 0,
      signalsCreated: 0,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown agent error",
    };
```

Replace with:

```typescript
    const run: AgentRun = {
      id: `run-${Date.now()}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      matchesProcessed: 0,
      snapshotsCreated: 0,
      signalsCreated: 0,
      rawFixtureCount: 0,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown agent error",
    };
```

- [ ] **Step 5: Verify the project builds**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no type errors.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all existing test files still pass (this task adds no new tests — it's plumbing, verified by the build and the manual check in Task 3; `agent.test.ts` only tests `findPendingSignals`/`findNewlySettledSignals`, which are untouched).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/services/txlineClient.ts apps/api/src/services/mockTxLine.ts apps/api/src/agent.ts
git commit -m "Thread rawFixtureCount through the feed pipeline into AgentRun"
```

---

### Task 2: `logic/feedHealth.ts` — the three assessment functions plus combinator

**Files:**
- Create: `apps/api/src/logic/feedHealth.ts`
- Create: `apps/api/src/logic/feedHealth.test.ts`

**Interfaces:**
- Consumes: `AgentRun`, `Match`, `OddsSnapshot` (existing types from `../types`; `AgentRun` now has `rawFixtureCount` from Task 1).
- Produces: `CycleHealth`, `OddsFreshness`, `StaleLiveMatch`, `FixtureCoverage` types; `assessCycleHealth`, `assessOddsFreshness`, `assessFixtureCoverage`, `computeFeedHealthStatus`, `ODDS_STALE_THRESHOLD_MS` — all consumed by Task 3 (`server.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/logic/feedHealth.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  assessCycleHealth,
  assessOddsFreshness,
  assessFixtureCoverage,
  computeFeedHealthStatus,
} from "./feedHealth";
import type { AgentRun, Match, OddsSnapshot } from "../types";

const NOW = new Date("2026-07-08T12:00:00.000Z").getTime();

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    startedAt: iso(0),
    finishedAt: iso(0),
    matchesProcessed: 5,
    snapshotsCreated: 2,
    signalsCreated: 1,
    rawFixtureCount: 5,
    status: "success",
    message: "ok",
    ...overrides,
  };
}

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
    lastUpdated: iso(0),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snap-1",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 3.0,
    drawOdds: 3.5,
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    source: "txline",
    createdAt: iso(0),
    ...overrides,
  };
}

describe("assessCycleHealth", () => {
  it("returns nulls and no exceeded gap for an empty run history", () => {
    expect(assessCycleHealth([], NOW, 5000)).toEqual({
      lastRunAt: null,
      cycleGapMs: null,
      expectedIntervalMs: 5000,
      isCurrentGapExceeded: false,
      recentMissedCycles: 0,
    });
  });

  it("does not flag a current gap within the 3x threshold", () => {
    const runs = [makeRun({ startedAt: iso(2000) })];
    const result = assessCycleHealth(runs, NOW, 5000);

    expect(result.isCurrentGapExceeded).toBe(false);
    expect(result.cycleGapMs).toBe(2000);
    expect(result.recentMissedCycles).toBe(0);
  });

  it("flags a current gap beyond the 3x threshold", () => {
    const runs = [makeRun({ startedAt: iso(20000) })];
    const result = assessCycleHealth(runs, NOW, 5000);

    expect(result.isCurrentGapExceeded).toBe(true);
    expect(result.cycleGapMs).toBe(20000);
  });

  it("counts a historical gap between two older runs as a missed cycle", () => {
    const runs = [
      makeRun({ startedAt: iso(0) }),
      makeRun({ startedAt: iso(6000) }),
      makeRun({ startedAt: iso(100000) }),
    ];
    const result = assessCycleHealth(runs, NOW, 5000);

    expect(result.isCurrentGapExceeded).toBe(false);
    expect(result.recentMissedCycles).toBe(1);
  });
});

describe("assessOddsFreshness", () => {
  it("reports no stale matches when there are no live matches", () => {
    const matches = [makeMatch({ status: "scheduled" })];
    const result = assessOddsFreshness(matches, [], NOW, 300000);

    expect(result).toEqual({
      staleThresholdMs: 300000,
      staleLiveMatchCount: 0,
      staleLiveMatches: [],
    });
  });

  it("does not flag a live match with a fresh snapshot", () => {
    const matches = [makeMatch({ status: "live" })];
    const snapshots = [makeSnapshot({ createdAt: iso(1000) })];
    const result = assessOddsFreshness(matches, snapshots, NOW, 300000);

    expect(result.staleLiveMatchCount).toBe(0);
  });

  it("flags a live match whose latest snapshot exceeds the threshold", () => {
    const matches = [makeMatch({ id: "match-1", homeTeam: "Team A", awayTeam: "Team B", status: "live" })];
    const snapshots = [makeSnapshot({ matchId: "match-1", createdAt: iso(400000) })];
    const result = assessOddsFreshness(matches, snapshots, NOW, 300000);

    expect(result.staleLiveMatchCount).toBe(1);
    expect(result.staleLiveMatches).toEqual([
      {
        matchId: "match-1",
        match: "Team A vs Team B",
        lastOddsAt: iso(400000),
        staleForMs: 400000,
      },
    ]);
  });

  it("does not flag a live match with no odds snapshot at all", () => {
    const matches = [makeMatch({ id: "match-2", status: "live" })];
    const result = assessOddsFreshness(matches, [], NOW, 300000);

    expect(result.staleLiveMatchCount).toBe(0);
  });
});

describe("assessFixtureCoverage", () => {
  it("returns nulls and no drop for an empty run history", () => {
    expect(assessFixtureCoverage([])).toEqual({
      lastRunRawFixtureCount: null,
      lastRunProcessedCount: null,
      isCoverageDropped: false,
      recentCoverageDrops: 0,
    });
  });

  it("reports no drop when raw and processed counts match", () => {
    const runs = [makeRun({ rawFixtureCount: 9, matchesProcessed: 9 })];
    const result = assessFixtureCoverage(runs);

    expect(result.isCoverageDropped).toBe(false);
    expect(result.recentCoverageDrops).toBe(0);
  });

  it("reports a drop when the raw count exceeds the processed count", () => {
    const runs = [makeRun({ rawFixtureCount: 16, matchesProcessed: 14 })];
    const result = assessFixtureCoverage(runs);

    expect(result.isCoverageDropped).toBe(true);
    expect(result.lastRunRawFixtureCount).toBe(16);
    expect(result.lastRunProcessedCount).toBe(14);
    expect(result.recentCoverageDrops).toBe(1);
  });

  it("counts multiple historical drops but reports isCoverageDropped only for the last run", () => {
    const runs = [
      makeRun({ rawFixtureCount: 9, matchesProcessed: 9 }),
      makeRun({ rawFixtureCount: 18, matchesProcessed: 14 }),
      makeRun({ rawFixtureCount: 20, matchesProcessed: 14 }),
    ];
    const result = assessFixtureCoverage(runs);

    expect(result.isCoverageDropped).toBe(false);
    expect(result.recentCoverageDrops).toBe(2);
  });
});

describe("computeFeedHealthStatus", () => {
  const healthyCycle = { lastRunAt: iso(0), cycleGapMs: 2000, expectedIntervalMs: 5000, isCurrentGapExceeded: false, recentMissedCycles: 0 };
  const healthyOdds = { staleThresholdMs: 300000, staleLiveMatchCount: 0, staleLiveMatches: [] };
  const healthyCoverage = { lastRunRawFixtureCount: 9, lastRunProcessedCount: 9, isCoverageDropped: false, recentCoverageDrops: 0 };

  it("returns healthy when all three checks are clean", () => {
    expect(computeFeedHealthStatus(healthyCycle, healthyOdds, healthyCoverage)).toBe("healthy");
  });

  it("returns down when the current cycle gap is exceeded, regardless of the others", () => {
    const downCycle = { ...healthyCycle, isCurrentGapExceeded: true };
    expect(computeFeedHealthStatus(downCycle, healthyOdds, healthyCoverage)).toBe("down");
  });

  it("returns degraded when there are historical missed cycles", () => {
    const degradedCycle = { ...healthyCycle, recentMissedCycles: 1 };
    expect(computeFeedHealthStatus(degradedCycle, healthyOdds, healthyCoverage)).toBe("degraded");
  });

  it("returns degraded when there are stale live matches", () => {
    const degradedOdds = { ...healthyOdds, staleLiveMatchCount: 1 };
    expect(computeFeedHealthStatus(healthyCycle, degradedOdds, healthyCoverage)).toBe("degraded");
  });

  it("returns degraded when the last run's coverage was dropped", () => {
    const degradedCoverage = { ...healthyCoverage, isCoverageDropped: true };
    expect(computeFeedHealthStatus(healthyCycle, healthyOdds, degradedCoverage)).toBe("degraded");
  });

  it("returns degraded when there are recent historical coverage drops even if the last run was clean", () => {
    const degradedCoverage = { ...healthyCoverage, recentCoverageDrops: 2 };
    expect(computeFeedHealthStatus(healthyCycle, healthyOdds, degradedCoverage)).toBe("degraded");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/feedHealth.test.ts
```

Expected: FAIL — `Cannot find module './feedHealth'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/logic/feedHealth.ts`:

```typescript
import type { AgentRun, Match, OddsSnapshot } from "../types";

const MISSED_CYCLE_MULTIPLIER = 3;

export const ODDS_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export interface CycleHealth {
  lastRunAt: string | null;
  cycleGapMs: number | null;
  expectedIntervalMs: number;
  isCurrentGapExceeded: boolean;
  recentMissedCycles: number;
}

/**
 * agentRuns is expected newest-first (matching store.agentRuns's unshift
 * convention). A gap - either the current gap since the last run, or any
 * gap between two consecutive historical runs - counts as "missed" when it
 * exceeds 3x the expected interval, generous enough to absorb normal jitter
 * (a slow TxLINE response, a GC pause) without false-positiving on every
 * cycle.
 */
export function assessCycleHealth(
  agentRuns: AgentRun[],
  now: number,
  expectedIntervalMs: number
): CycleHealth {
  const missedThresholdMs = expectedIntervalMs * MISSED_CYCLE_MULTIPLIER;

  if (agentRuns.length === 0) {
    return {
      lastRunAt: null,
      cycleGapMs: null,
      expectedIntervalMs,
      isCurrentGapExceeded: false,
      recentMissedCycles: 0,
    };
  }

  const lastRunAt = agentRuns[0].startedAt;
  const cycleGapMs = now - new Date(lastRunAt).getTime();
  const isCurrentGapExceeded = cycleGapMs > missedThresholdMs;

  let recentMissedCycles = 0;
  for (let i = 0; i < agentRuns.length - 1; i += 1) {
    const newer = new Date(agentRuns[i].startedAt).getTime();
    const older = new Date(agentRuns[i + 1].startedAt).getTime();
    if (newer - older > missedThresholdMs) {
      recentMissedCycles += 1;
    }
  }

  return { lastRunAt, cycleGapMs, expectedIntervalMs, isCurrentGapExceeded, recentMissedCycles };
}

export interface StaleLiveMatch {
  matchId: string;
  match: string;
  lastOddsAt: string;
  staleForMs: number;
}

export interface OddsFreshness {
  staleThresholdMs: number;
  staleLiveMatchCount: number;
  staleLiveMatches: StaleLiveMatch[];
}

/**
 * A Match's own lastUpdated can't go stale while present in store.matches
 * (it's wholesale-replaced and re-stamped every cycle) - the signal that
 * actually can go stale is a live match's most recent odds snapshot. A live
 * match with no odds snapshot at all is not flagged - there is nothing to
 * compare against, and absence of data is not evidence of bad data (see
 * marketMaker.ts's UNKNOWN reliability precedent).
 */
export function assessOddsFreshness(
  matches: Match[],
  oddsSnapshots: OddsSnapshot[],
  now: number,
  staleThresholdMs: number
): OddsFreshness {
  const staleLiveMatches: StaleLiveMatch[] = [];

  for (const match of matches) {
    if (match.status !== "live") continue;

    const latestSnapshot = oddsSnapshots
      .filter((snapshot) => snapshot.matchId === match.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (!latestSnapshot) continue;

    const staleForMs = now - new Date(latestSnapshot.createdAt).getTime();

    if (staleForMs > staleThresholdMs) {
      staleLiveMatches.push({
        matchId: match.id,
        match: `${match.homeTeam} vs ${match.awayTeam}`,
        lastOddsAt: latestSnapshot.createdAt,
        staleForMs,
      });
    }
  }

  return {
    staleThresholdMs,
    staleLiveMatchCount: staleLiveMatches.length,
    staleLiveMatches,
  };
}

export interface FixtureCoverage {
  lastRunRawFixtureCount: number | null;
  lastRunProcessedCount: number | null;
  isCoverageDropped: boolean;
  recentCoverageDrops: number;
}

/**
 * A drop is rawFixtureCount > matchesProcessed on a given run -
 * self-contained, never hardcodes the underlying 14-fixture cap constant,
 * so it stays correct even if that constant changes elsewhere.
 */
export function assessFixtureCoverage(agentRuns: AgentRun[]): FixtureCoverage {
  if (agentRuns.length === 0) {
    return {
      lastRunRawFixtureCount: null,
      lastRunProcessedCount: null,
      isCoverageDropped: false,
      recentCoverageDrops: 0,
    };
  }

  const lastRun = agentRuns[0];
  const isCoverageDropped = lastRun.rawFixtureCount > lastRun.matchesProcessed;
  const recentCoverageDrops = agentRuns.filter(
    (run) => run.rawFixtureCount > run.matchesProcessed
  ).length;

  return {
    lastRunRawFixtureCount: lastRun.rawFixtureCount,
    lastRunProcessedCount: lastRun.matchesProcessed,
    isCoverageDropped,
    recentCoverageDrops,
  };
}

/**
 * "down" overrides everything else - a dead scheduler makes the other two
 * checks moot, since no new data is coming in at all.
 */
export function computeFeedHealthStatus(
  cycleHealth: CycleHealth,
  oddsFreshness: OddsFreshness,
  fixtureCoverage: FixtureCoverage
): "healthy" | "degraded" | "down" {
  if (cycleHealth.isCurrentGapExceeded) return "down";

  const isDegraded =
    cycleHealth.recentMissedCycles > 0 ||
    oddsFreshness.staleLiveMatchCount > 0 ||
    fixtureCoverage.isCoverageDropped ||
    fixtureCoverage.recentCoverageDrops > 0;

  return isDegraded ? "degraded" : "healthy";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/feedHealth.test.ts
```

Expected: PASS, all 18 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/feedHealth.ts apps/api/src/logic/feedHealth.test.ts
git commit -m "Add pure feed health assessment functions"
```

---

### Task 3: Register `GET /api/feed-health` in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `assessCycleHealth`, `assessOddsFreshness`, `assessFixtureCoverage`, `computeFeedHealthStatus`, `ODDS_STALE_THRESHOLD_MS` (Task 2, `./logic/feedHealth`).
- Produces: the live `GET /api/feed-health` route, consumed by Task 4 (openapi.yaml documentation).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, add this import line right after the existing `import { computeDissent, summarizeDissent } from "./logic/councilDissent";` line:

```typescript
import {
  assessCycleHealth,
  assessFixtureCoverage,
  assessOddsFreshness,
  computeFeedHealthStatus,
  ODDS_STALE_THRESHOLD_MS,
} from "./logic/feedHealth";
```

- [ ] **Step 2: Add the route**

Find this exact block in `apps/api/src/server.ts` (the end of the `GET /api/archive` route):

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
app.get("/api/archive", async (req, res) => {
  const page = parsePageParam(req.query.page);
  const pageSize = parsePageSizeParam(req.query.pageSize);
  const filters = parseArchiveFilters(req.query as Record<string, unknown>);

  const result = await getArchivedSignals(filters, { page, pageSize });

  res.json(result);
});

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

- [ ] **Step 3: Verify the project builds**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no type errors.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass, total test count higher than the pre-existing 95.

- [ ] **Step 5: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`), then in another terminal:

```bash
curl -s "http://localhost:4000/api/feed-health" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log(JSON.stringify(body.data, null, 2));
});
"
```

Expected: `status` is `"healthy"` (a freshly started dev server has no missed cycles, no stale live matches yet, and simulated/real feed data shouldn't be dropping coverage), and `cycleHealth`/`oddsFreshness`/`fixtureCoverage` each show plausible values matching what `GET /api/agent-runs` and `GET /api/matches` report at the same moment.

Stop the dev server afterward by finding its PID (`netstat -ano | grep ":4000.*LISTENING"` on Windows) and killing that exact PID — do not use a broad `pkill` pattern, and confirm via the process's command line that it's the one you started (this repo has a history of stray leftover dev-server processes from other sessions on this machine).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Register GET /api/feed-health route"
```

---

### Task 4: Document `GET /api/feed-health` in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml` (`AgentRun` schema, new `/api/feed-health` path)

**Interfaces:**
- Consumes: the route from Task 3 (documents actual behavior; no code dependency).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add `rawFixtureCount` to the `AgentRun` schema**

Find this exact block:

```yaml
    AgentRun:
      type: object
      properties:
        id: { type: string }
        startedAt: { type: string, format: date-time }
        finishedAt: { type: string, format: date-time }
        matchesProcessed: { type: number }
        snapshotsCreated: { type: number }
        signalsCreated: { type: number }
        status: { type: string, enum: [success, error] }
        message: { type: string }
      required: [id, startedAt, finishedAt, matchesProcessed, snapshotsCreated, signalsCreated, status, message]
```

Replace with:

```yaml
    AgentRun:
      type: object
      properties:
        id: { type: string }
        startedAt: { type: string, format: date-time }
        finishedAt: { type: string, format: date-time }
        matchesProcessed: { type: number }
        snapshotsCreated: { type: number }
        signalsCreated: { type: number }
        rawFixtureCount: { type: number }
        status: { type: string, enum: [success, error] }
        message: { type: string }
      required: [id, startedAt, finishedAt, matchesProcessed, snapshotsCreated, signalsCreated, rawFixtureCount, status, message]
```

- [ ] **Step 2: Add the new path**

Find this exact block (the end of the `/api/archive` path, right before `/api/onchain/validate-stat`):

```yaml
                  pagination:
                    type: object
                    properties:
                      page:
                        type: integer
                      pageSize:
                        type: integer
                      totalCount:
                        type: integer
                      totalPages:
                        type: integer
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/onchain/validate-stat:
```

Replace with:

```yaml
                  pagination:
                    type: object
                    properties:
                      page:
                        type: integer
                      pageSize:
                        type: integer
                      totalCount:
                        type: integer
                      totalPages:
                        type: integer
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/feed-health:
    get:
      summary: TxLINE feed health and data-quality diagnostic
      description: >
        Reports on feed degradation separate from match-odds signals: whether
        the autonomous agent's cycle is running on schedule, whether any live
        match's odds feed has gone quiet, and whether the live poll loop's
        per-cycle fixture cap silently dropped coverage. Separate from GET
        /health, which is a fast liveness probe.
      responses:
        '200':
          description: Current feed health status and the three underlying checks.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: object
                    properties:
                      status:
                        type: string
                        enum: [healthy, degraded, down]
                      cycleHealth:
                        type: object
                        properties:
                          lastRunAt: { type: string, format: date-time, nullable: true }
                          cycleGapMs: { type: number, nullable: true }
                          expectedIntervalMs: { type: number }
                          isCurrentGapExceeded: { type: boolean }
                          recentMissedCycles: { type: number }
                        required: [lastRunAt, cycleGapMs, expectedIntervalMs, isCurrentGapExceeded, recentMissedCycles]
                      oddsFreshness:
                        type: object
                        properties:
                          staleThresholdMs: { type: number }
                          staleLiveMatchCount: { type: number }
                          staleLiveMatches:
                            type: array
                            items:
                              type: object
                              properties:
                                matchId: { type: string }
                                match: { type: string }
                                lastOddsAt: { type: string, format: date-time }
                                staleForMs: { type: number }
                              required: [matchId, match, lastOddsAt, staleForMs]
                        required: [staleThresholdMs, staleLiveMatchCount, staleLiveMatches]
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

- [ ] **Step 3: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same pre-existing cosmetic `operationId` warnings as before (no new errors).

- [ ] **Step 4: Commit**

```bash
git add openapi.yaml
git commit -m "Document GET /api/feed-health in openapi.yaml"
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

Expected: all test files pass. Note the exact new total test count (was 95 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`, add a new section (after the "Insert-Only Signal Archive" section, matching the pattern of a dedicated section per feature) describing feed health monitoring: the three checks, the status derivation rule, and the new `GET /api/feed-health` endpoint. Add `logic/feedHealth.ts` to the "Important backend files" list.

In `SUBMISSION_NOTES.md`, add a matching entry under "Major Features Added This Session" describing the same three checks in the narrative style already used there.

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`:
- Add `GET /api/feed-health (cycle health, odds freshness, fixture coverage diagnostic)` to the API Endpoints list, in the position matching where it was registered in `server.ts` (right after `/api/archive`).
- Update the automated-test-count line to the real number measured in Step 1.

In `PROJECT_STATE.md`:
- Add a new dated entry describing this feature (spec/plan file paths, the three checks, and the one new `AgentRun.rawFixtureCount` field).
- Update the "17 backend routes total" count to 18 and add `/api/feed-health` to the route list.
- Update the test file list/count to match Step 1's real number, including `logic/feedHealth.test.ts` in the file list.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document feed health monitoring across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the entire branch's diff (all 5 tasks' commits together) before merging to `main` — do not merge without it.
