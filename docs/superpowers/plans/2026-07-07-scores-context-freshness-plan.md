# Scores-Context Freshness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop attaching a `scoresContext` to a TxLINE odds tick when that context doesn't actually describe the tick's own moment in the match, so Contrarian's field-backed/market-only classification can't be silently mislabeled by stale metadata.

**Architecture:** One shared pure function, `isScoresContextFresh` (in `apps/api/src/logic/scoresContextFreshness.ts`), used by two consumers: `apps/api/src/services/txlineClient.ts` (Task 1 — gates the `scoresContext` stamped onto each odds tick at snapshot-creation time) and `apps/api/src/logic/signalEngine.ts` (Task 2 — gates the `current ?? previous` fallback a signal's own `scoresContext` falls back to, checked against the *signal's* own timestamp rather than `previous`'s).

**Tech Stack:** TypeScript, Vitest (existing stack, no new dependencies).

## Global Constraints

- Fail-safe over precise: when freshness can't be confirmed (missing timestamp on either side), omit the context — never assume it's fresh (spec: "Goals").
- Threshold is exactly `60_000` ms (60 seconds) — chosen from real observed gap data, not an arbitrary round number (spec: "Decisions made during design", #2).
- All three snapshot-layer call sites get the fix, not just the one that surfaced the bug: `fetchTxLineFeed`'s 1X2 loop, `fetchTxLineFeed`'s totals loop, and `fetchRecentTxLineResults`'s loop (spec: "Decisions made during design", #3).
- `signalEngine.ts`'s `current ?? previous` fallback also gets a freshness check, against the signal's own (`current`'s) timestamp, not `previous`'s own timestamp (spec: "Decisions made during design", #4).
- `isScoresContextFresh`/`SCORES_CONTEXT_TOLERANCE_MS` live in a shared `apps/api/src/logic/scoresContextFreshness.ts` module, not colocated in `txlineClient.ts`, so both consumers import from one neutral location instead of `logic/` depending on `services/` (spec: "Decisions made during design", #5).
- No changes to `types.ts`, `arena.ts`, `store.ts`, or `agent.ts` — every downstream reader of `evidence.scoresContext` already handles it being `undefined` (spec: "Design", "Non-goals").
- Does not change `selectMovementOdds`'s historical reach-back behavior — that's a legitimate feature, not the bug (spec: "Alternatives considered").
- `signalEngine.ts` only changes on the one fallback line Decision #4 identifies — no broader change to that file (spec: "Non-goals").

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

### Task 2: Shared module extraction, and gate `signalEngine.ts`'s fallback

**Files:**
- Create: `apps/api/src/logic/scoresContextFreshness.ts`
- Create: `apps/api/src/logic/scoresContextFreshness.test.ts`
- Delete: `apps/api/src/services/txlineClient.test.ts` (superseded by the file above)
- Modify: `apps/api/src/services/txlineClient.ts`
- Modify: `apps/api/src/logic/signalEngine.ts`
- Modify: `apps/api/src/logic/signalEngine.test.ts`

**Interfaces:**
- Relocates `isScoresContextFresh`/`SCORES_CONTEXT_TOLERANCE_MS` from Task 1's location in `txlineClient.ts` to the new shared module — same names, same signatures, no behavior change to the function itself.
- Consumes: nothing from another task. Produces: `signalEngine.ts`'s `buildSignalFromSnapshots` now gates its `current ?? previous` scoresContext fallback through the same freshness check.

- [ ] **Step 1: Create the shared module**

Create `apps/api/src/logic/scoresContextFreshness.ts`:

```ts
export const SCORES_CONTEXT_TOLERANCE_MS = 60_000;

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
```

- [ ] **Step 2: Move the existing tests to the new location**

Create `apps/api/src/logic/scoresContextFreshness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isScoresContextFresh } from "./scoresContextFreshness";

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

- [ ] **Step 3: Run the moved tests to confirm the relocation didn't break anything**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npx vitest run src/logic/scoresContextFreshness.test.ts`
Expected: PASS — all 7 tests pass (identical content to the file being replaced, just a new location).

- [ ] **Step 4: Remove the old definition from `txlineClient.ts` and import from the shared module instead**

In `apps/api/src/services/txlineClient.ts`, find:

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

Replace with:

```ts
    confirmed: meaningfulEvent.Confirmed,
    sequence: meaningfulEvent.Seq,
    timestamp,
    proofLabel: "Generated from real TXODDS Scores event context",
  };
}

const RECENT_RESULT_FIXTURES: TxLineFixture[] = [
```

Then, at the top of the same file, find:

```ts
import { config } from "../config";
import { Match, OddsSnapshot, TxLineScoresContext } from "../types";
```

Replace with:

```ts
import { config } from "../config";
import { Match, OddsSnapshot, TxLineScoresContext } from "../types";
import { isScoresContextFresh, SCORES_CONTEXT_TOLERANCE_MS } from "../logic/scoresContextFreshness";
```

(The three call sites wired in Task 1 don't change at all — they already call `isScoresContextFresh(...)` and reference `SCORES_CONTEXT_TOLERANCE_MS` by these exact names, so importing them has no effect on that code.)

- [ ] **Step 5: Delete the superseded test file**

```bash
git rm apps/api/src/services/txlineClient.test.ts
```

- [ ] **Step 6: Run the full test suite and build to confirm the relocation is clean**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 56 tests pass (49 original + 7 relocated — same total as after Task 1, since this step only moves tests, it doesn't add any yet).

- [ ] **Step 7: Write the new signalEngine.ts fallback tests**

No new import is needed — these tests only use `makeSnapshot`'s existing `evidence` override, and `makeSnapshot`/`buildSignalFromSnapshots` are already imported at the top of `apps/api/src/logic/signalEngine.test.ts`.

Add the following at the end of the file, directly after the closing `});` of the existing `describe("buildSignalFromSnapshots", ...)` block:

```ts

describe("buildSignalFromSnapshots scoresContext fallback", () => {
  it("uses current's own scoresContext when present, without needing previous's", () => {
    const previous = makeSnapshot({
      id: "snapshot-previous",
      createdAt: "2026-07-07T01:00:00.000Z",
    });
    const current = makeSnapshot({
      id: "snapshot-current",
      createdAt: "2026-07-07T01:00:30.000Z",
      homeOdds: 1.8,
      evidence: {
        source: "txline",
        scoresContext: { timestamp: "2026-07-07T01:00:30.000Z", fieldPressureScore: 40 },
      },
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.evidence?.scoresContext?.fieldPressureScore).toBe(40);
  });

  it("falls back to previous's scoresContext when current has none and previous's is fresh relative to current's own timestamp", () => {
    const previous = makeSnapshot({
      id: "snapshot-previous",
      createdAt: "2026-07-07T01:00:00.000Z",
      evidence: {
        source: "txline",
        scoresContext: { timestamp: "2026-07-07T01:00:00.000Z", fieldPressureScore: 15 },
      },
    });
    const current = makeSnapshot({
      id: "snapshot-current",
      createdAt: "2026-07-07T01:00:30.000Z",
      homeOdds: 1.8,
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.evidence?.scoresContext?.fieldPressureScore).toBe(15);
  });

  it("drops to undefined when previous's scoresContext is stale relative to current's own timestamp, even though it was fresh for previous itself", () => {
    const previous = makeSnapshot({
      id: "snapshot-previous",
      createdAt: "2026-07-07T01:00:00.000Z",
      evidence: {
        source: "txline",
        // Fresh for previous's own moment (0s gap), but current arrives 90s
        // later - beyond the 60s tolerance.
        scoresContext: { timestamp: "2026-07-07T01:00:00.000Z", fieldPressureScore: 15 },
      },
    });
    const current = makeSnapshot({
      id: "snapshot-current",
      createdAt: "2026-07-07T01:01:30.000Z",
      homeOdds: 1.8,
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.evidence?.scoresContext).toBeUndefined();
  });
});
```

- [ ] **Step 8: Run the new tests to verify the expected RED**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npx vitest run src/logic/signalEngine.test.ts`
Expected: 2 of the 3 new tests PASS already (`current`'s own context is used unconditionally when present, and the existing unconditional `?? previous...` fallback already happens to return the fresh case correctly) — only the third test ("drops to undefined when previous's scoresContext is stale relative to current's own timestamp") FAILS, because the current code substitutes `previous`'s context unconditionally with no freshness check against `current`'s timestamp. This is expected: it's the one test that exercises genuinely new behavior; the other two lock in behavior that already holds.

- [ ] **Step 9: Implement the fallback freshness check**

In `apps/api/src/logic/signalEngine.ts`, find:

```ts
import { AgentSignal, OddsSnapshot, Severity, TeamSide, TxLineScoresContext } from "../types";
```

Replace with:

```ts
import { AgentSignal, OddsSnapshot, Severity, TeamSide, TxLineScoresContext } from "../types";
import { isScoresContextFresh, SCORES_CONTEXT_TOLERANCE_MS } from "./scoresContextFreshness";
```

Then find:

```ts
  const target = side === "home" ? current.homeTeam : current.awayTeam;
  const oddsBefore = side === "home" ? previous.homeOdds : previous.awayOdds;
  const oddsAfter = side === "home" ? current.homeOdds : current.awayOdds;
  const scoresContext =
    current.evidence?.scoresContext ?? previous.evidence?.scoresContext;
```

Replace with:

```ts
  const target = side === "home" ? current.homeTeam : current.awayTeam;
  const oddsBefore = side === "home" ? previous.homeOdds : previous.awayOdds;
  const oddsAfter = side === "home" ? current.homeOdds : current.awayOdds;
  const scoresContext =
    current.evidence?.scoresContext ??
    (isScoresContextFresh(
      new Date(current.createdAt).getTime(),
      previous.evidence?.scoresContext?.timestamp,
      SCORES_CONTEXT_TOLERANCE_MS
    )
      ? previous.evidence?.scoresContext
      : undefined);
```

- [ ] **Step 10: Run the new tests to verify GREEN**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npx vitest run src/logic/signalEngine.test.ts`
Expected: PASS — all tests in the file pass, including all 3 new ones.

- [ ] **Step 11: Run the full test suite and build**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 59 tests pass (56 from after Task 1's relocation + 3 new `signalEngine.ts` tests).

Note: same as Task 1 — this cannot be manually verified against a live TxLINE feed without real credentials. The build passing plus the full suite staying green is the correct and sufficient verification.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/logic/scoresContextFreshness.ts apps/api/src/logic/scoresContextFreshness.test.ts apps/api/src/services/txlineClient.ts apps/api/src/logic/signalEngine.ts apps/api/src/logic/signalEngine.test.ts
git commit -m "Extract scoresContextFreshness module; gate signalEngine's fallback against current's own timestamp"
```

---

## Self-Review

**Spec coverage:**
- Fail-safe over precise, omit rather than guess (spec: "Goals", "Decisions made during design" #1) → Task 1, Step 3 (`isScoresContextFresh` returns `false` on any missing timestamp); reused identically by Task 2.
- 60-second threshold from real gap data (spec: "Decisions made during design" #2) → Task 1, Step 3 (`SCORES_CONTEXT_TOLERANCE_MS = 60_000`); same constant reused by Task 2, not re-declared.
- All three snapshot-layer call sites fixed (spec: "Decisions made during design" #3) → Task 1, Steps 5-6 (1X2 live loop, totals live loop, recent-results backfill loop).
- `signalEngine.ts`'s fallback checked against `current`'s own timestamp, not `previous`'s (spec: "Decisions made during design" #4) → Task 2, Step 9.
- Shared module, not colocated in `txlineClient.ts` (spec: "Decisions made during design" #5) → Task 2, Steps 1, 4 (extraction), 9 (second consumer imports from the same place).
- No changes to `types.ts`/`arena.ts`/`store.ts`/`agent.ts` (spec: "Non-goals") → confirmed, all file changes across both tasks are within `txlineClient.ts`, `signalEngine.ts`, and the new `scoresContextFreshness.ts`/its test file.
- `signalEngine.ts` only changes on the one fallback line (spec: "Non-goals") → confirmed, Task 2 Step 9's diff is exactly that one expression; no other logic in the file is touched.
- `selectMovementOdds`'s reach-back behavior untouched (spec: "Alternatives considered") → confirmed, not modified anywhere in this plan.

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete, either copied verbatim from the actual current file contents (confirmed by reading them during planning) or fully written new content. (One no-op find/replace was caught and removed from Task 2 Step 7 during this self-review — replaced with a plain instruction since no import change was actually needed there.)

**Type consistency:** `isScoresContextFresh(tickTs: number | undefined, contextTimestamp: string | undefined, toleranceMs: number): boolean` is defined once in Task 1 Step 3, relocated verbatim (same signature) in Task 2 Step 1, and used identically in Task 1 Steps 5-6 and Task 2 Step 9. `item.Ts` is `number | undefined` (matches `TxLineOddsSnapshot.Ts`); `scoresContext?.timestamp` and `previous.evidence?.scoresContext?.timestamp` are both `string | undefined` (matches `TxLineScoresContext.timestamp`); `new Date(current.createdAt).getTime()` produces `number` (matches `OddsSnapshot.createdAt: string` converted the same way Task 1 already converts tick timestamps) — consistent with the function's declared parameter types at every call site across both tasks.
