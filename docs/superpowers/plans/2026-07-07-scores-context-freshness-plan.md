# Scores-Context Freshness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop attaching a `scoresContext` to a TxLINE odds tick when that context doesn't actually describe the tick's own moment in the match, so Contrarian's field-backed/market-only classification can't be silently mislabeled by stale metadata.

**Architecture:** One new pure function, `isScoresContextFresh`, colocated in `apps/api/src/services/txlineClient.ts` next to `buildScoresContext`. Each of the three call sites that currently stamp one shared `scoresContext` object onto every odds tick in a poll batch is changed to check freshness per tick and pass `undefined` instead when the tick's own timestamp is too far from the context's timestamp.

**Tech Stack:** TypeScript, Vitest (existing stack, no new dependencies).

## Global Constraints

- Fail-safe over precise: when freshness can't be confirmed (missing timestamp on either side), omit the context — never assume it's fresh (spec: "Goals").
- Threshold is exactly `60_000` ms (60 seconds) — chosen from real observed gap data, not an arbitrary round number (spec: "Decisions made during design", #2).
- All three call sites get the fix, not just the one that surfaced the bug: `fetchTxLineFeed`'s 1X2 loop, `fetchTxLineFeed`'s totals loop, and `fetchRecentTxLineResults`'s loop (spec: "Decisions made during design", #3).
- No changes to `types.ts`, `arena.ts`, `store.ts`, or `agent.ts` — every downstream reader of `evidence.scoresContext` already handles it being `undefined` (spec: "Design", "Non-goals").
- Does not change `selectMovementOdds`'s historical reach-back behavior — that's a legitimate feature, not the bug (spec: "Alternatives considered").

---

### Task 1: `isScoresContextFresh` and its three call sites

**Files:**
- Modify: `apps/api/src/services/txlineClient.ts`
- Create: `apps/api/src/services/txlineClient.test.ts`

**Interfaces:**
- Produces: `isScoresContextFresh(tickTs: number | undefined, contextTimestamp: string | undefined, toleranceMs: number): boolean`, exported from `txlineClient.ts`. Nothing outside this task consumes it — it's wired into the same file's own call sites.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/txlineClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isScoresContextFresh } from "./txlineClient";

const TOLERANCE_MS = 60_000;

describe("isScoresContextFresh", () => {
  it("is fresh when the tick and context timestamps are exactly equal", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(true);
  });

  it("is fresh when the gap is just under the threshold", () => {
    const tickTs = new Date("2026-07-07T01:00:59.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(true);
  });

  it("is not fresh when the gap is just over the threshold", () => {
    const tickTs = new Date("2026-07-07T01:01:01.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(false);
  });

  it("is not fresh when the tick timestamp is missing", () => {
    expect(
      isScoresContextFresh(undefined, "2026-07-07T01:00:00.000Z", TOLERANCE_MS)
    ).toBe(false);
  });

  it("is not fresh when the context timestamp is missing", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();

    expect(isScoresContextFresh(tickTs, undefined, TOLERANCE_MS)).toBe(false);
  });

  it("is fresh when the context timestamp is slightly ahead of the tick, within the threshold", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:05.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(true);
  });

  it("is not fresh when the context timestamp is far ahead of the tick, beyond the threshold", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:02:00.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npx vitest run src/services/txlineClient.test.ts`
Expected: FAIL — cannot resolve `isScoresContextFresh` from `./txlineClient` (the export does not exist yet).

- [ ] **Step 3: Add the function**

In `apps/api/src/services/txlineClient.ts`, find the end of `buildScoresContext` (it currently ends directly before `const RECENT_RESULT_FIXTURES`):

```ts
    confirmed: meaningfulEvent.Confirmed,
    sequence: meaningfulEvent.Seq,
    timestamp,
    proofLabel: "Generated from real TXODDS Scores event context",
  };
}
const RECENT_RESULT_FIXTURES: TxLineFixture[] = [
```

Replace with (adding the new function and its threshold constant directly after `buildScoresContext`):

```ts
    confirmed: meaningfulEvent.Confirmed,
    sequence: meaningfulEvent.Seq,
    timestamp,
    proofLabel: "Generated from real TXODDS Scores event context",
  };
}

const SCORES_CONTEXT_TOLERANCE_MS = 60_000;

/**
 * A single scoresContext is computed once per poll and would otherwise be
 * stamped onto every odds tick selected that poll, including ticks
 * selectMovementOdds reaches back for from well outside the recent window.
 * When a tick's own timestamp is too far from the context's timestamp, the
 * context no longer describes that tick's moment - omit it (fail safe)
 * rather than attach a stale, potentially wrong fieldPressureScore.
 */
export function isScoresContextFresh(
  tickTs: number | undefined,
  contextTimestamp: string | undefined,
  toleranceMs: number
): boolean {
  if (!tickTs || !contextTimestamp) return false;

  const contextMs = new Date(contextTimestamp).getTime();
  return Math.abs(tickTs - contextMs) <= toleranceMs;
}

const RECENT_RESULT_FIXTURES: TxLineFixture[] = [
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npx vitest run src/services/txlineClient.test.ts`
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Wire the check into `fetchTxLineFeed`'s 1X2 loop**

In `apps/api/src/services/txlineClient.ts`, find:

```ts
    for (const item of selectedOdds) {
      const endpointUsed =
        item.MessageId === latestOdds?.MessageId
          ? `/api/odds/snapshot/${fixture.FixtureId}`
          : `/api/odds/updates/${fixture.FixtureId}`;

      snapshots.push(normalizeOddsSnapshot(match, item, endpointUsed, scoresContext));
    }

    for (const item of selectedTotalsOdds) {
      const endpointUsed =
        item.MessageId === latestTotalsOdds?.MessageId
          ? `/api/odds/snapshot/${fixture.FixtureId}`
          : `/api/odds/updates/${fixture.FixtureId}`;

      snapshots.push(normalizeTotalsSnapshot(match, item, endpointUsed, scoresContext));
    }
```

Replace with (both loops in `fetchTxLineFeed` — the 1X2 loop and the totals loop directly after it):

```ts
    for (const item of selectedOdds) {
      const endpointUsed =
        item.MessageId === latestOdds?.MessageId
          ? `/api/odds/snapshot/${fixture.FixtureId}`
          : `/api/odds/updates/${fixture.FixtureId}`;

      const contextForItem = isScoresContextFresh(
        item.Ts,
        scoresContext?.timestamp,
        SCORES_CONTEXT_TOLERANCE_MS
      )
        ? scoresContext
        : undefined;

      snapshots.push(normalizeOddsSnapshot(match, item, endpointUsed, contextForItem));
    }

    for (const item of selectedTotalsOdds) {
      const endpointUsed =
        item.MessageId === latestTotalsOdds?.MessageId
          ? `/api/odds/snapshot/${fixture.FixtureId}`
          : `/api/odds/updates/${fixture.FixtureId}`;

      const contextForItem = isScoresContextFresh(
        item.Ts,
        scoresContext?.timestamp,
        SCORES_CONTEXT_TOLERANCE_MS
      )
        ? scoresContext
        : undefined;

      snapshots.push(normalizeTotalsSnapshot(match, item, endpointUsed, contextForItem));
    }
```

- [ ] **Step 6: Wire the check into `fetchRecentTxLineResults`'s loop**

In `apps/api/src/services/txlineClient.ts`, find (inside `fetchRecentTxLineResults`, indented one level deeper than the previous step's loops):

```ts
      for (const item of selectedOdds) {
        const endpointUsed =
          item.MessageId === latestOdds?.MessageId
            ? `/api/odds/snapshot/${fixture.FixtureId}`
            : `/api/odds/updates/${fixture.FixtureId}`;

        snapshots.push(normalizeOddsSnapshot(match, item, endpointUsed, scoresContext));
      }
    } catch (error) {
      console.warn(
        `TxLINE recent result bootstrap skipped for fixture ${fixture.FixtureId}:`,
        error instanceof Error ? error.message : error
      );
    }
```

Replace with:

```ts
      for (const item of selectedOdds) {
        const endpointUsed =
          item.MessageId === latestOdds?.MessageId
            ? `/api/odds/snapshot/${fixture.FixtureId}`
            : `/api/odds/updates/${fixture.FixtureId}`;

        const contextForItem = isScoresContextFresh(
          item.Ts,
          scoresContext?.timestamp,
          SCORES_CONTEXT_TOLERANCE_MS
        )
          ? scoresContext
          : undefined;

        snapshots.push(normalizeOddsSnapshot(match, item, endpointUsed, contextForItem));
      }
    } catch (error) {
      console.warn(
        `TxLINE recent result bootstrap skipped for fixture ${fixture.FixtureId}:`,
        error instanceof Error ? error.message : error
      );
    }
```

- [ ] **Step 7: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

- [ ] **Step 8: Run the full test suite to check for regressions**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 56 tests pass (49 existing + 7 new). No existing test touches `txlineClient.ts`'s exported functions, so none should be affected.

Note: this change cannot be manually verified against a live dev server in the normal way — `fetchTxLineFeed`/`fetchRecentTxLineResults` require a real `TXLINE_API_KEY` to reach TxLINE's actual API, and the three call sites changed here are deep inside that network-calling code path, not behind any new HTTP endpoint or UI. The build passing (confirms the wiring type-checks against `normalizeOddsSnapshot`/`normalizeTotalsSnapshot`'s existing signatures) plus the full existing suite staying green (confirms no regression to anything already covered) is the correct and sufficient verification for this task — do not attempt to fabricate a live TxLINE call to "prove" it further.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/txlineClient.ts apps/api/src/services/txlineClient.test.ts
git commit -m "Freshness-gate scoresContext per odds tick to prevent stale field-context labeling"
```

---

## Self-Review

**Spec coverage:**
- Fail-safe over precise, omit rather than guess (spec: "Goals", "Decisions made during design" #1) → Task 1, Step 3 (`isScoresContextFresh` returns `false` on any missing timestamp).
- 60-second threshold from real gap data (spec: "Decisions made during design" #2) → Task 1, Step 3 (`SCORES_CONTEXT_TOLERANCE_MS = 60_000`).
- All three call sites fixed (spec: "Decisions made during design" #3) → Task 1, Steps 5-6 (1X2 live loop, totals live loop, recent-results backfill loop).
- No changes to `types.ts`/`arena.ts`/`store.ts`/`agent.ts` (spec: "Non-goals") → confirmed, this plan's only file changes are within `txlineClient.ts` plus its new test file.
- `selectMovementOdds`'s reach-back behavior untouched (spec: "Alternatives considered") → confirmed, not modified anywhere in this plan.

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete, either copied verbatim from the actual current file contents (confirmed by reading them during planning) or fully written new content.

**Type consistency:** `isScoresContextFresh(tickTs: number | undefined, contextTimestamp: string | undefined, toleranceMs: number): boolean` is defined once in Step 3 and used identically (same argument order and types) in Steps 5 and 6. `item.Ts` is `number | undefined` (matches `TxLineOddsSnapshot.Ts`) and `scoresContext?.timestamp` is `string | undefined` (matches `TxLineScoresContext.timestamp`) at every call site — consistent with the function's declared parameter types.
