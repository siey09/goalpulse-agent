# Feed Health / Data-Quality Monitoring Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

GoalPulse's autonomous agent (`agent.ts`'s `processAgentCycle`) already stores
`AgentRun` records (`store.agentRuns`, capped 50) and a separate push-stream
connectivity state (`txlineStream.ts`, exposed via `GET /health`). Neither
detects or surfaces genuine feed/data-quality degradation as its own concern:

- A stuck or crashed cycle scheduler currently just shows up as a longer gap
  between `agentRuns` entries, with nothing flagging it.
- TxLINE going quiet on a specific live fixture's odds feed is invisible —
  there is no staleness check on odds data at all.
- The live poll loop's 14-fixture-per-cycle cap (`prioritizeLikelyLiveFixtures`
  then `.slice(0, 14)` in `txlineClient.ts`) can silently drop coverage when
  more than 14 fixtures are returned by TxLINE in one poll — the raw
  pre-slice count is never captured or exposed anywhere today.

This directly protects against a repeat of two things already found this
session: the stale-finished-match-repolling known limitation, and the
deploy-lag incident (where verifying "is this actually live and healthy"
required manually scanning the signal store rather than checking a status
endpoint).

## Three independent checks

### 1. Cycle health

Is the agent's polling loop actually running on schedule? A gap is "missed"
when it exceeds **3x `config.agentIntervalMs`** — generous enough to absorb
normal jitter (a slow TxLINE response, a GC pause) without false-positiving
on every cycle, consistent with this session's precedent of deriving
thresholds from the system's own behavior rather than guessing tightly.

Two related but distinct facts are reported:
- **Current gap**: time since the most recent `AgentRun`'s `startedAt`,
  compared against the threshold — answers "is the scheduler stuck *right
  now*."
- **Recent missed cycles**: a count of how many gaps *between* consecutive
  historical runs (across all 50 stored `agentRuns`) exceeded the threshold —
  answers "has this happened recently, even if it's fine right now."

### 2. Odds freshness

**Redefined during brainstorming** from the original "stale `lastUpdated`"
framing: a `Match`'s `lastUpdated` is stamped to "now" every time it's
re-fetched, and `store.matches` is wholesale-replaced every cycle — so a
match cannot sit in the array with a stale `lastUpdated` while still present;
if it drops out of TxLINE's response, it simply disappears from the array,
it doesn't linger stale. The signal that actually can go stale is a live
match's **most recent odds snapshot**.

For every match with `status === "live"`, find its most recent
`OddsSnapshot.createdAt` (via the existing snapshot-lookup pattern already
used elsewhere, e.g. `findPreviousSnapshot`). If `now - createdAt` exceeds a
**fixed 5-minute threshold**, the match is stale: TxLINE has gone quiet on
that specific fixture's odds feed even though it's nominally still live. Five
minutes is long enough to tolerate a genuinely quiet stretch of a match
(stable odds, no new ticks) without false-positiving, but still catches a
real, meaningfully long outage. This is a fixed constant, not a multiple of
`agentIntervalMs`, because odds ticks don't arrive every single cycle even in
healthy operation (no new tick if nothing changed).

### 3. Fixture coverage

Requires one new, minimal piece of instrumentation. `AgentRun` already has
`matchesProcessed` (the post-cap count, i.e. `feed.matches.length`) — the
only new field needed is `rawFixtureCount`, the pre-cap count, so coverage
drop is detected as `rawFixtureCount > matchesProcessed` (self-contained;
never hardcodes the "14" cap constant, so it stays correct even if that
constant changes elsewhere).

- `TxLineFeedResult` (`txlineClient.ts`) gains `rawFixtureCount?: number`.
- `fetchTxLineFeed()` sets it to `fixtures.length` — the count returned by
  `/api/fixtures/snapshot` *before* `prioritizeLikelyLiveFixtures(...).slice(0, 14)`.
- `fetchSimulatedTxLineFeed()` (`mockTxLine.ts`) sets it to its own generated
  fixture list's length, which is never capped in demo mode — so simulated
  runs never falsely report a coverage drop.
- `fetchRecentTxLineResults()` (the historical-backfill path, used by
  `/api/replay/backtest`, not the live poll loop) is untouched — coverage
  capping is a live-poll-cycle concept, not a backfill concept, and this
  function already returns a `TxLineFeedResult` without needing the new
  optional field populated.
- `agent.ts`'s `processAgentCycle` sets `AgentRun.rawFixtureCount` to
  `feed.rawFixtureCount ?? feed.matches.length` on the success path (falls
  back to "no drop possible" if a call site somehow doesn't supply it — never
  happens in practice, since `processAgentCycle` only ever calls
  `fetchTxLineFeed`/`fetchSimulatedTxLineFeed`, both of which now always
  supply it), and `0` on the error path, matching the existing convention of
  zeroing every other count there.

Same reporting shape as cycle health: the **current** cycle's coverage state
(did the *last* run drop fixtures), plus a **recent** count (how many of the
stored `agentRuns` show a drop).

## Implementation

New pure module, `apps/api/src/logic/feedHealth.ts`, following this session's
established convention (`arena.ts`, `marketMaker.ts`, `councilDissent.ts`,
`paginationParams.ts` — all pure, no I/O, independently testable):

```typescript
export interface CycleHealth {
  lastRunAt: string | null;
  cycleGapMs: number | null;
  expectedIntervalMs: number;
  isCurrentGapExceeded: boolean;
  recentMissedCycles: number;
}

export function assessCycleHealth(
  agentRuns: AgentRun[],
  now: number,
  expectedIntervalMs: number
): CycleHealth;

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

export function assessOddsFreshness(
  matches: Match[],
  oddsSnapshots: OddsSnapshot[],
  now: number,
  staleThresholdMs: number
): OddsFreshness;

export interface FixtureCoverage {
  lastRunRawFixtureCount: number | null;
  lastRunProcessedCount: number | null;
  isCoverageDropped: boolean;
  recentCoverageDrops: number;
}

export function assessFixtureCoverage(agentRuns: AgentRun[]): FixtureCoverage;

export function computeFeedHealthStatus(
  cycleHealth: CycleHealth,
  oddsFreshness: OddsFreshness,
  fixtureCoverage: FixtureCoverage
): "healthy" | "degraded" | "down";
```

`agentRuns` is expected newest-first (matching `store.agentRuns`'s existing
`unshift` convention), so "the last run" is `agentRuns[0]` and "gaps between
consecutive runs" are adjacent-pair comparisons walking that order.

**Status derivation:**
- `"down"` — `cycleHealth.isCurrentGapExceeded` is true (the scheduler looks
  stuck right now; this alone overrides everything else, since a dead
  scheduler makes the other two checks moot — no new data is coming in at
  all).
- `"degraded"` — not down, but any of: `recentMissedCycles > 0`,
  `staleLiveMatchCount > 0`, or `isCoverageDropped` / `recentCoverageDrops > 0`.
- `"healthy"` — none of the above.

## New endpoint: `GET /api/feed-health`

Separate from `GET /health` (kept as-is: a fast liveness probe, what
UptimeRobot pings every 5 minutes) — this is a richer diagnostic report, a
different concern ("is the process alive" vs. "is the data quality good").

```json
{
  "data": {
    "status": "healthy",
    "cycleHealth": {
      "lastRunAt": "2026-07-08T10:41:56.000Z",
      "cycleGapMs": 5230,
      "expectedIntervalMs": 5000,
      "isCurrentGapExceeded": false,
      "recentMissedCycles": 0
    },
    "oddsFreshness": {
      "staleThresholdMs": 300000,
      "staleLiveMatchCount": 0,
      "staleLiveMatches": []
    },
    "fixtureCoverage": {
      "lastRunRawFixtureCount": 9,
      "lastRunProcessedCount": 9,
      "isCoverageDropped": false,
      "recentCoverageDrops": 0
    }
  }
}
```

`server.ts`'s new route calls the three `assess*` functions with
`store.agentRuns`, `store.matches`, `store.oddsSnapshots`,
`config.agentIntervalMs`, `Date.now()`, and the 5-minute stale constant, then
`computeFeedHealthStatus` to combine them. Public GET, no API key, covered by
the existing general rate limiter — same as every other GET route.

## Testing

Unit tests for all four pure functions against plain objects (no mocking, no
I/O): `assessCycleHealth` (empty history, no gap exceeded, current gap
exceeded, historical missed cycles counted correctly), `assessOddsFreshness`
(no live matches, a live match with a fresh snapshot, a live match with a
stale snapshot, a live match with no snapshot at all — should not crash, and
per the codebase's existing precedent of not penalizing "no data" the same
as "bad data," a match with zero odds history should not count as stale
since there is nothing to compare against), `assessFixtureCoverage` (no
runs, no drop, a drop, multiple historical drops), and
`computeFeedHealthStatus` (all three healthy combinations →
`"healthy"`; each individual degraded condition → `"degraded"`; current gap
exceeded → `"down"` regardless of the other two).

## Docs

`openapi.yaml` gets a new `/api/feed-health` path plus schemas for the
response shape above. `AgentRun`'s schema gains `rawFixtureCount`.

## Out of scope (explicitly deferred)

- No dashboard panel — backend-only, matching the pattern already
  established for the signal archive's read endpoint (data made queryable
  first, frontend consumption deferred).
- No automated alerting (e.g. Discord) on a "down"/"degraded" status — this
  spec only makes the state queryable via the API; wiring it into
  `alerts.ts` would be a separate, later feature if wanted.
- No change to the underlying 14-fixture cap, the agent interval, or the
  odds-polling behavior itself — this spec only observes and reports on
  existing behavior, it does not change when/how often data is actually
  fetched.
