# Arena Kelly-Criterion Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third Arena agent, Kelly Criterion, that sizes each position using the Kelly formula driven by `confidenceScore`, alongside the existing flat-stake Momentum Follower and Contrarian agents.

**Architecture:** `ArenaPosition` gains an explicit `stakeUnits` field so `summarize()`'s ROI math generalizes correctly to variable-stake agents. A new pure `calculateKellyStake` derives an implied edge from `confidenceScore` blended with the market's own implied probability, then a new `buildKellyCriterionPosition` builds positions the same way the existing two agents' builder functions do. `server.ts`'s `/api/arena` route is extended to include the third scoreboard in both the JSON response and the SHA-256 tamper-evident proof hash.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-arena-kelly-criterion-design.md`

## Global Constraints

- `MAX_EDGE = 0.15`, `MAX_STAKE_FRACTION = 0.2`, `KELLY_BANKROLL_UNITS = 10` — exact constants from the spec, not adjustable within this plan.
- Kelly takes the **same side** as the original signal (a sizing strategy, not a direction strategy) — unlike Contrarian, which fades it.
- Kelly excludes Over/Under totals signals (`isTotalsSignal`), matching Arena's own existing in-family convention for its other two agents.
- `signal.confidenceScore ?? 0` — a signal missing the field is treated as zero edge (stakes nothing), never a crash.
- The `-0` fix: stake negation must be written as `0 - stakeUnits`, never `-stakeUnits`, so a zero-stake incorrect position's `profitUnits` is `+0` (matters for Vitest's `Object.is`-based `toBe()`).
- This refactor must be 100% behavior-preserving for Momentum Follower/Contrarian's existing `roiPercent`/`netUnits`/`winRatePct` values — verified by extending the existing regression test, not rewriting it.
- No dashboard/frontend changes — backend-only.
- Test runner: Vitest, run from `apps/api/` via `npm run test`.
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged.

---

### Task 1: Generalize stake handling — `stakeUnits` field and `settleStake`

**Files:**
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/logic/arena.ts`
- Modify: `apps/api/src/logic/arena.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ArenaPosition.stakeUnits: number` (consumed by Task 2's Kelly builder and Task 4's docs); `settleStake(resultStatus, oddsTaken, stakeUnits): number` (consumed by Task 2's Kelly builder).

- [ ] **Step 1: Add `stakeUnits` to `ArenaPosition` and extend `ArenaAgentId`**

In `apps/api/src/types.ts`, find:

```typescript
export type ArenaAgentId = "momentum_follower" | "contrarian";

export interface ArenaPosition {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  match: string;
  side: TeamSide;
  target: string;
  oddsTaken: number;
  resultStatus: "pending" | "correct" | "incorrect";
  profitUnits: number;
}
```

Replace with:

```typescript
export type ArenaAgentId = "momentum_follower" | "contrarian" | "kelly_criterion";

export interface ArenaPosition {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  match: string;
  side: TeamSide;
  target: string;
  oddsTaken: number;
  stakeUnits: number;
  resultStatus: "pending" | "correct" | "incorrect";
  profitUnits: number;
}
```

- [ ] **Step 2: Write the failing tests for `stakeUnits` on the existing two agents**

In `apps/api/src/logic/arena.test.ts`, add this assertion to the existing `it("takes the signal's own side/target/odds verbatim and settles a win", ...)` test inside `describe("buildMomentumFollowerPosition", ...)` — find:

```typescript
    expect(position).not.toBeNull();
    expect(position?.side).toBe("home");
    expect(position?.target).toBe("Team A");
    expect(position?.oddsTaken).toBe(1.5);
    // profit = 1 * (1.5 - 1) = 0.5
    expect(position?.profitUnits).toBe(0.5);
  });
```

Replace with:

```typescript
    expect(position).not.toBeNull();
    expect(position?.side).toBe("home");
    expect(position?.target).toBe("Team A");
    expect(position?.oddsTaken).toBe(1.5);
    expect(position?.stakeUnits).toBe(1);
    // profit = 1 * (1.5 - 1) = 0.5
    expect(position?.profitUnits).toBe(0.5);
  });
```

Then find this test inside `describe("buildContrarianPosition", ...)`:

```typescript
  it("takes the opposite side and reads its real quoted price from the snapshot", () => {
    const signal = makeSignal({
      side: "home",
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 0 } },
    });
    const snapshot = makeSnapshot({ homeOdds: 1.5, awayOdds: 6.0 });

    const position = buildContrarianPosition(signal, makeMatch({ status: "live" }), snapshot);

    expect(position?.side).toBe("away");
    expect(position?.target).toBe("Team B");
    expect(position?.oddsTaken).toBe(6.0);
  });
```

Replace with:

```typescript
  it("takes the opposite side and reads its real quoted price from the snapshot", () => {
    const signal = makeSignal({
      side: "home",
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 0 } },
    });
    const snapshot = makeSnapshot({ homeOdds: 1.5, awayOdds: 6.0 });

    const position = buildContrarianPosition(signal, makeMatch({ status: "live" }), snapshot);

    expect(position?.side).toBe("away");
    expect(position?.target).toBe("Team B");
    expect(position?.oddsTaken).toBe(6.0);
    expect(position?.stakeUnits).toBe(1);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/arena.test.ts
```

Expected: FAIL — `position?.stakeUnits` is `undefined`, not `1` (TypeScript will also flag the missing property once Step 1's type change is in place, but these two runtime assertions are the actual red bar to fix).

- [ ] **Step 4: Implement `settleStake`, replacing `settleUnit`, and add `stakeUnits` to both existing builders**

In `apps/api/src/logic/arena.ts`, find:

```typescript
function settleUnit(resultStatus: "pending" | "correct" | "incorrect", oddsTaken: number): number {
  if (resultStatus === "correct") {
    const price = oddsTaken && oddsTaken > 1 ? oddsTaken : 1;
    return round(UNIT_STAKE * (price - 1));
  }

  if (resultStatus === "incorrect") return -UNIT_STAKE;

  return 0;
}
```

Replace with:

```typescript
/**
 * Generalizes the old flat-UNIT_STAKE settlement to any stake size, so
 * Momentum Follower/Contrarian (always UNIT_STAKE) and Kelly Criterion
 * (variable) share one settlement function. Negation is written as
 * `0 - stakeUnits`, not `-stakeUnits`, so a 0-stake incorrect position
 * settles to +0, not -0 - a real distinction under Vitest's
 * Object.is-based toBe(), which Kelly's legitimately-zero stakes can hit
 * (the flat-stake agents never could, since UNIT_STAKE is always 1).
 */
function settleStake(
  resultStatus: "pending" | "correct" | "incorrect",
  oddsTaken: number,
  stakeUnits: number
): number {
  if (resultStatus === "correct") {
    const price = oddsTaken && oddsTaken > 1 ? oddsTaken : 1;
    return round(stakeUnits * (price - 1));
  }

  if (resultStatus === "incorrect") return 0 - stakeUnits;

  return 0;
}
```

Then find:

```typescript
export function buildMomentumFollowerPosition(signal: AgentSignal): ArenaPosition | null {
  if (isTotalsSignal(signal)) return null;

  return {
    agentId: "momentum_follower",
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: signal.side,
    target: signal.target,
    oddsTaken: signal.oddsAfter,
    resultStatus: signal.resultStatus,
    profitUnits: settleUnit(signal.resultStatus, signal.oddsAfter),
  };
}
```

Replace with:

```typescript
export function buildMomentumFollowerPosition(signal: AgentSignal): ArenaPosition | null {
  if (isTotalsSignal(signal)) return null;

  return {
    agentId: "momentum_follower",
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: signal.side,
    target: signal.target,
    oddsTaken: signal.oddsAfter,
    stakeUnits: UNIT_STAKE,
    resultStatus: signal.resultStatus,
    profitUnits: settleStake(signal.resultStatus, signal.oddsAfter, UNIT_STAKE),
  };
}
```

Then find the end of `buildContrarianPosition`:

```typescript
  return {
    agentId: "contrarian",
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: opposingSide,
    target: opposingTarget,
    oddsTaken,
    resultStatus,
    profitUnits: settleUnit(resultStatus, oddsTaken),
  };
}
```

Replace with:

```typescript
  return {
    agentId: "contrarian",
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: opposingSide,
    target: opposingTarget,
    oddsTaken,
    stakeUnits: UNIT_STAKE,
    resultStatus,
    profitUnits: settleStake(resultStatus, oddsTaken, UNIT_STAKE),
  };
}
```

Finally, find `summarize()`:

```typescript
function summarize(
  agentId: ArenaAgentId,
  label: string,
  positions: ArenaPosition[]
): ArenaScoreboard {
  const settled = positions.filter((position) => position.resultStatus !== "pending");
  const correct = settled.filter((position) => position.resultStatus === "correct");
  const incorrect = settled.filter((position) => position.resultStatus === "incorrect");
  const netUnits = round(settled.reduce((sum, position) => sum + position.profitUnits, 0));
  const roiPercent =
    settled.length === 0 ? 0 : round((netUnits / (settled.length * UNIT_STAKE)) * 100);
  const winRatePct =
    settled.length === 0 ? 0 : round((correct.length / settled.length) * 100);
```

Replace with:

```typescript
function summarize(
  agentId: ArenaAgentId,
  label: string,
  positions: ArenaPosition[]
): ArenaScoreboard {
  const settled = positions.filter((position) => position.resultStatus !== "pending");
  const correct = settled.filter((position) => position.resultStatus === "correct");
  const incorrect = settled.filter((position) => position.resultStatus === "incorrect");
  const netUnits = round(settled.reduce((sum, position) => sum + position.profitUnits, 0));
  const totalStaked = settled.reduce((sum, position) => sum + position.stakeUnits, 0);
  const roiPercent = totalStaked === 0 ? 0 : round((netUnits / totalStaked) * 100);
  const winRatePct =
    settled.length === 0 ? 0 : round((correct.length / settled.length) * 100);
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/arena.test.ts
```

Expected: PASS, all existing tests green, including the two new `stakeUnits` assertions — and the existing `computeArenaScoreboards` aggregate test's `roiPercent`/`netUnits`/`winRatePct` values are unchanged (75%, 1.5, 100%, -1, 0% respectively), confirming the refactor is behavior-preserving.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/logic/arena.ts apps/api/src/logic/arena.test.ts
git commit -m "Generalize Arena settlement to variable stakes via stakeUnits/settleStake"
```

---

### Task 2: Kelly-criterion agent — `calculateKellyStake` and `buildKellyCriterionPosition`

**Files:**
- Modify: `apps/api/src/logic/arena.ts`
- Modify: `apps/api/src/logic/arena.test.ts`

**Interfaces:**
- Consumes: `settleStake` (Task 1, same file); `AgentSignal.confidenceScore?: number` (existing, `../types`).
- Produces: `calculateKellyStake(oddsTaken: number, confidenceScore: number): number`; `buildKellyCriterionPosition(signal: AgentSignal): ArenaPosition | null` — both consumed by Task 3 (`computeArenaScoreboards`).

- [ ] **Step 1: Write the failing tests for `calculateKellyStake`**

In `apps/api/src/logic/arena.test.ts`, add this import to the existing import line — find:

```typescript
import {
  buildContrarianPosition,
  buildMomentumFollowerPosition,
  computeArenaScoreboards,
  isMarketOnlyMove,
  isTotalsSignal,
} from "./arena";
```

Replace with:

```typescript
import {
  buildContrarianPosition,
  buildKellyCriterionPosition,
  buildMomentumFollowerPosition,
  calculateKellyStake,
  computeArenaScoreboards,
  isMarketOnlyMove,
  isTotalsSignal,
} from "./arena";
```

Then add this new `describe` block at the end of the file:

```typescript

describe("calculateKellyStake", () => {
  it("stakes exactly 0 when confidenceScore is 0, regardless of odds", () => {
    // Zero assumed edge means our probability estimate equals the market's
    // own implied probability exactly, which algebraically zeroes the
    // Kelly fraction for any odds value - not a coincidence of one
    // particular odds price.
    expect(calculateKellyStake(3.0, 0)).toBe(0);
  });

  it("computes an uncapped stake for a mid-range confidence", () => {
    // odds=2.0: marketImpliedProb=0.5, edgeFraction=0.5*0.15=0.075,
    // ourProbEstimate=0.575, b=1.0, q=0.425.
    // kellyFraction = (1*0.575 - 0.425) / 1 = 0.15 (below the 0.2 cap).
    // stake = 0.15 * 10 = 1.5.
    expect(calculateKellyStake(2.0, 50)).toBe(1.5);
  });

  it("caps the stake at MAX_STAKE_FRACTION for a high-confidence, short-odds signal", () => {
    // odds=2.0, confidenceScore=100: ourProbEstimate=0.65, b=1.0, q=0.35.
    // kellyFraction raw = (0.65-0.35)/1 = 0.30, capped at 0.2.
    // stake = 0.2 * 10 = 2.0.
    expect(calculateKellyStake(2.0, 100)).toBe(2.0);
  });

  it("stakes 0 for odds at or below 1, avoiding division by zero", () => {
    expect(calculateKellyStake(1.0, 100)).toBe(0);
  });
});

describe("buildKellyCriterionPosition", () => {
  it("returns null for totals signals", () => {
    const signal = makeSignal({ target: "Over 3.5", confidenceScore: 100 });

    expect(buildKellyCriterionPosition(signal)).toBeNull();
  });

  it("takes the signal's own side/target/odds, sized by confidenceScore", () => {
    const signal = makeSignal({
      side: "home",
      target: "Team A",
      oddsAfter: 2.0,
      confidenceScore: 100,
      resultStatus: "correct",
    });

    const position = buildKellyCriterionPosition(signal);

    expect(position).not.toBeNull();
    expect(position?.side).toBe("home");
    expect(position?.target).toBe("Team A");
    expect(position?.oddsTaken).toBe(2.0);
    expect(position?.stakeUnits).toBe(2.0);
    // profit = 2.0 * (2.0 - 1) = 2.0
    expect(position?.profitUnits).toBe(2.0);
  });

  it("settles a loss proportional to the computed stake for an incorrect signal", () => {
    const signal = makeSignal({
      oddsAfter: 2.0,
      confidenceScore: 100,
      resultStatus: "incorrect",
    });

    const position = buildKellyCriterionPosition(signal);

    expect(position?.stakeUnits).toBe(2.0);
    expect(position?.profitUnits).toBe(-2.0);
  });

  it("settles 0 profit for a pending signal", () => {
    const signal = makeSignal({ confidenceScore: 100, resultStatus: "pending" });

    const position = buildKellyCriterionPosition(signal);

    expect(position?.profitUnits).toBe(0);
  });

  it("treats a missing confidenceScore as zero edge, staking nothing", () => {
    const signal = makeSignal({ confidenceScore: undefined, resultStatus: "pending" });

    const position = buildKellyCriterionPosition(signal);

    expect(position?.stakeUnits).toBe(0);
    expect(position?.profitUnits).toBe(0);
  });

  it("settles a zero-stake incorrect position to +0, not -0", () => {
    const signal = makeSignal({
      oddsAfter: 2.0,
      confidenceScore: 0,
      resultStatus: "incorrect",
    });

    const position = buildKellyCriterionPosition(signal);

    expect(position?.stakeUnits).toBe(0);
    expect(position?.profitUnits).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/arena.test.ts
```

Expected: FAIL — `calculateKellyStake` and `buildKellyCriterionPosition` are not exported from `./arena` yet.

- [ ] **Step 3: Implement `calculateKellyStake` and `buildKellyCriterionPosition`**

In `apps/api/src/logic/arena.ts`, find:

```typescript
const MARKET_ONLY_THRESHOLD = 22;
const UNIT_STAKE = 1;

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}
```

Replace with:

```typescript
const MARKET_ONLY_THRESHOLD = 22;
const UNIT_STAKE = 1;
const MAX_EDGE = 0.15;
const MAX_STAKE_FRACTION = 0.2;
const KELLY_BANKROLL_UNITS = 10;

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
```

Then find the end of `buildContrarianPosition` (right before `function summarize(`):

```typescript
    profitUnits: settleStake(resultStatus, oddsTaken, UNIT_STAKE),
  };
}

function summarize(
```

Replace with:

```typescript
    profitUnits: settleStake(resultStatus, oddsTaken, UNIT_STAKE),
  };
}

/**
 * confidenceScore (0-100) is a quality measure, not a literal win
 * probability - using it as one directly would be a category error.
 * Instead it scales an assumed edge over the market's own implied
 * probability (1/oddsTaken), capped at MAX_EDGE. At confidenceScore=0 the
 * edge is exactly 0, which algebraically zeroes the Kelly fraction for
 * any odds value (our probability estimate collapses back to exactly the
 * market's own break-even price). The raw Kelly fraction is capped at
 * MAX_STAKE_FRACTION (full Kelly can recommend unrealistically large
 * fractions) then scaled by KELLY_BANKROLL_UNITS so stakes land in a
 * range comparable to the other agents' flat 1-unit bets.
 */
export function calculateKellyStake(oddsTaken: number, confidenceScore: number): number {
  if (oddsTaken <= 1) return 0;

  const marketImpliedProb = 1 / oddsTaken;
  const edgeFraction = (clamp(confidenceScore, 0, 100) / 100) * MAX_EDGE;
  const ourProbEstimate = clamp(marketImpliedProb + edgeFraction, 0, 1);

  const b = oddsTaken - 1;
  const p = ourProbEstimate;
  const q = 1 - p;

  const kellyFraction = clamp((b * p - q) / b, 0, MAX_STAKE_FRACTION);

  return round(kellyFraction * KELLY_BANKROLL_UNITS);
}

/**
 * Kelly Criterion: takes the SAME side as the original signal (a sizing
 * strategy, not a direction strategy, unlike Contrarian) - only how much
 * to stake varies, driven by confidenceScore.
 */
export function buildKellyCriterionPosition(signal: AgentSignal): ArenaPosition | null {
  if (isTotalsSignal(signal)) return null;

  const stakeUnits = calculateKellyStake(signal.oddsAfter, signal.confidenceScore ?? 0);

  return {
    agentId: "kelly_criterion",
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: signal.side,
    target: signal.target,
    oddsTaken: signal.oddsAfter,
    stakeUnits,
    resultStatus: signal.resultStatus,
    profitUnits: settleStake(signal.resultStatus, signal.oddsAfter, stakeUnits),
  };
}

function summarize(
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/arena.test.ts
```

Expected: PASS, all tests green (existing tests plus the new `calculateKellyStake`/`buildKellyCriterionPosition` tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/arena.ts apps/api/src/logic/arena.test.ts
git commit -m "Add Kelly-criterion Arena agent sized by confidenceScore"
```

---

### Task 3: Wire Kelly into `computeArenaScoreboards`

**Files:**
- Modify: `apps/api/src/logic/arena.ts`
- Modify: `apps/api/src/logic/arena.test.ts`

**Interfaces:**
- Consumes: `buildKellyCriterionPosition` (Task 2, same file).
- Produces: `computeArenaScoreboards(...): { momentumFollower, contrarian, kellyCriterion }` — consumed by Task 4 (`server.ts`).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/logic/arena.test.ts`, find the existing aggregate test inside `describe("computeArenaScoreboards", ...)`:

```typescript
    const { momentumFollower, contrarian } = computeArenaScoreboards(
      signals,
      matchesById,
      snapshotsById
    );

    // Momentum Follower took both signals at face value, both correct:
    // (1.5-1) + (2.0-1) = 1.5 net units over 2 settled bets -> 75% ROI
    expect(momentumFollower.settledCount).toBe(2);
    expect(momentumFollower.netUnits).toBe(1.5);
    expect(momentumFollower.roiPercent).toBe(75);
    expect(momentumFollower.winRatePct).toBe(100);

    // Contrarian only acted on signal-1 (market-only move, fieldPressureScore 0);
    // signal-2 was field-backed (45) so Contrarian sat it out. Contrarian faded
    // signal-1 (bet away), but home actually won 2-0, so Contrarian lost that bet.
    expect(contrarian.settledCount).toBe(1);
    expect(contrarian.netUnits).toBe(-1);
    expect(contrarian.winRatePct).toBe(0);
  });
});
```

Replace with:

```typescript
    const { momentumFollower, contrarian, kellyCriterion } = computeArenaScoreboards(
      signals,
      matchesById,
      snapshotsById
    );

    // Momentum Follower took both signals at face value, both correct:
    // (1.5-1) + (2.0-1) = 1.5 net units over 2 settled bets -> 75% ROI
    expect(momentumFollower.settledCount).toBe(2);
    expect(momentumFollower.netUnits).toBe(1.5);
    expect(momentumFollower.roiPercent).toBe(75);
    expect(momentumFollower.winRatePct).toBe(100);

    // Contrarian only acted on signal-1 (market-only move, fieldPressureScore 0);
    // signal-2 was field-backed (45) so Contrarian sat it out. Contrarian faded
    // signal-1 (bet away), but home actually won 2-0, so Contrarian lost that bet.
    expect(contrarian.settledCount).toBe(1);
    expect(contrarian.netUnits).toBe(-1);
    expect(contrarian.winRatePct).toBe(0);

    // Kelly: neither signal in this fixture sets confidenceScore, so both
    // are treated as zero edge and stake nothing - regression check that
    // a real pre-item-7 signal shape doesn't crash Kelly, it just sits out.
    expect(kellyCriterion.settledCount).toBe(2);
    expect(kellyCriterion.netUnits).toBe(0);
    expect(kellyCriterion.roiPercent).toBe(0);
  });

  it("computes Kelly's variable stakes correctly across multiple signals", () => {
    const signals: AgentSignal[] = [
      makeSignal({
        id: "signal-a",
        resultStatus: "correct",
        oddsAfter: 2.0,
        confidenceScore: 100,
      }),
      makeSignal({
        id: "signal-b",
        resultStatus: "incorrect",
        oddsAfter: 2.0,
        confidenceScore: 50,
      }),
    ];

    const { kellyCriterion } = computeArenaScoreboards(
      signals,
      new Map(),
      new Map()
    );

    expect(kellyCriterion.positions[0].stakeUnits).toBe(2.0);
    expect(kellyCriterion.positions[1].stakeUnits).toBe(1.5);
    expect(kellyCriterion.settledCount).toBe(2);
    expect(kellyCriterion.correctCount).toBe(1);
    expect(kellyCriterion.incorrectCount).toBe(1);
    // netUnits = 2.0 + (-1.5) = 0.5; totalStaked = 2.0 + 1.5 = 3.5
    // roiPercent = round((0.5 / 3.5) * 100) = 14.29
    expect(kellyCriterion.netUnits).toBe(0.5);
    expect(kellyCriterion.roiPercent).toBe(14.29);
    expect(kellyCriterion.winRatePct).toBe(50);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/arena.test.ts
```

Expected: FAIL — `computeArenaScoreboards` doesn't return a `kellyCriterion` property yet.

- [ ] **Step 3: Implement**

In `apps/api/src/logic/arena.ts`, find:

```typescript
export function computeArenaScoreboards(
  signals: AgentSignal[],
  matchesById: Map<string, Match>,
  snapshotsById: Map<string, OddsSnapshot>
): { momentumFollower: ArenaScoreboard; contrarian: ArenaScoreboard } {
  const momentumPositions: ArenaPosition[] = [];
  const contrarianPositions: ArenaPosition[] = [];

  for (const signal of signals) {
    const momentumPosition = buildMomentumFollowerPosition(signal);
    if (momentumPosition) momentumPositions.push(momentumPosition);

    const match = matchesById.get(signal.matchId);
    const snapshotId = signal.evidence?.currentSnapshotId;
    const snapshot = snapshotId ? snapshotsById.get(snapshotId) : undefined;
    const contrarianPosition = buildContrarianPosition(signal, match, snapshot);
    if (contrarianPosition) contrarianPositions.push(contrarianPosition);
  }

  return {
    momentumFollower: summarize("momentum_follower", "Momentum Follower", momentumPositions),
    contrarian: summarize("contrarian", "Contrarian", contrarianPositions),
  };
}
```

Replace with:

```typescript
export function computeArenaScoreboards(
  signals: AgentSignal[],
  matchesById: Map<string, Match>,
  snapshotsById: Map<string, OddsSnapshot>
): {
  momentumFollower: ArenaScoreboard;
  contrarian: ArenaScoreboard;
  kellyCriterion: ArenaScoreboard;
} {
  const momentumPositions: ArenaPosition[] = [];
  const contrarianPositions: ArenaPosition[] = [];
  const kellyPositions: ArenaPosition[] = [];

  for (const signal of signals) {
    const momentumPosition = buildMomentumFollowerPosition(signal);
    if (momentumPosition) momentumPositions.push(momentumPosition);

    const match = matchesById.get(signal.matchId);
    const snapshotId = signal.evidence?.currentSnapshotId;
    const snapshot = snapshotId ? snapshotsById.get(snapshotId) : undefined;
    const contrarianPosition = buildContrarianPosition(signal, match, snapshot);
    if (contrarianPosition) contrarianPositions.push(contrarianPosition);

    const kellyPosition = buildKellyCriterionPosition(signal);
    if (kellyPosition) kellyPositions.push(kellyPosition);
  }

  return {
    momentumFollower: summarize("momentum_follower", "Momentum Follower", momentumPositions),
    contrarian: summarize("contrarian", "Contrarian", contrarianPositions),
    kellyCriterion: summarize("kelly_criterion", "Kelly Criterion", kellyPositions),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/arena.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/logic/arena.ts apps/api/src/logic/arena.test.ts
git commit -m "Wire Kelly Criterion into computeArenaScoreboards"
```

---

### Task 4: Wire the third scoreboard into `GET /api/arena`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `computeArenaScoreboards` (Task 3, `./logic/arena`, already imported).
- Produces: the live three-agent `/api/arena` response, consumed by Task 5 (openapi.yaml documentation).

- [ ] **Step 1: Update the route**

In `apps/api/src/server.ts`, find:

```typescript
  const { momentumFollower, contrarian } = computeArenaScoreboards(
    store.signals,
    matchesById,
    snapshotsById
  );
```

Replace with:

```typescript
  const { momentumFollower, contrarian, kellyCriterion } = computeArenaScoreboards(
    store.signals,
    matchesById,
    snapshotsById
  );
```

Then find:

```typescript
  const proofHash = createHash("sha256")
    .update(
      JSON.stringify({
        momentumFollower: momentumFollower.positions,
        contrarian: contrarian.positions,
      })
    )
    .digest("hex");

  res.json({
    data: {
      momentumFollower,
      contrarian,
      proof: {
        type: "sha256",
        hash: proofHash,
        verifiableStat,
        note:
          "Tamper-evident SHA-256 hash of both agents' full position ledgers, plus a real on-chain Merkle proof (via GET /api/onchain/validate-stat) confirming the underlying TxLINE data this tournament is based on is genuinely anchored on Solana mainnet. This does not mean funds move or a smart contract executes - GoalPulse is analytics only and does not place wagers, custody funds, execute trades, or facilitate betting execution.",
      },
    },
  });
});
```

Replace with:

```typescript
  const proofHash = createHash("sha256")
    .update(
      JSON.stringify({
        momentumFollower: momentumFollower.positions,
        contrarian: contrarian.positions,
        kellyCriterion: kellyCriterion.positions,
      })
    )
    .digest("hex");

  res.json({
    data: {
      momentumFollower,
      contrarian,
      kellyCriterion,
      proof: {
        type: "sha256",
        hash: proofHash,
        verifiableStat,
        note:
          "Tamper-evident SHA-256 hash of all three agents' full position ledgers, plus a real on-chain Merkle proof (via GET /api/onchain/validate-stat) confirming the underlying TxLINE data this tournament is based on is genuinely anchored on Solana mainnet. This does not mean funds move or a smart contract executes - GoalPulse is analytics only and does not place wagers, custody funds, execute trades, or facilitate betting execution.",
      },
    },
  });
});
```

- [ ] **Step 2: Verify the project builds**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no type errors.

- [ ] **Step 3: Run the full test suite**

```bash
cd apps/api && npm run test
```

Expected: all test files pass.

- [ ] **Step 4: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`), checking port availability first (`netstat -ano | grep ":4000.*LISTENING"`; if occupied, verify the PID's command line via `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'` before touching it, and prefer an alternate port like `PORT=4070 npm run dev` if it's not yours). Then in another terminal:

```bash
curl -s "http://localhost:4070/api/arena" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log('kellyCriterion:', JSON.stringify(body.data.kellyCriterion, null, 2));
  console.log('proof.note:', body.data.proof.note);
});
"
```

Expected: a `kellyCriterion` scoreboard with the same shape as `momentumFollower`/`contrarian` (each position now also showing `stakeUnits`), and the proof note mentioning "all three agents." Stop the dev server afterward by finding its PID via `netstat -ano | grep ":4070.*LISTENING"`, confirming the command line via `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'`, then stopping that exact PID.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Include Kelly Criterion in the /api/arena response and proof hash"
```

---

### Task 5: Document in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: the type/route changes from Tasks 1-4 (documents actual behavior; no code dependency).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update `ArenaPosition` and `ArenaScoreboard` schemas**

Find:

```yaml
    ArenaPosition:
      type: object
      properties:
        agentId: { type: string, enum: [momentum_follower, contrarian] }
        signalId: { type: string }
        matchId: { type: string }
        match: { type: string }
        side: { type: string, enum: [home, away] }
        target: { type: string }
        oddsTaken: { type: number }
        resultStatus: { type: string, enum: [pending, correct, incorrect] }
        profitUnits: { type: number }
      required: [agentId, signalId, matchId, match, side, target, oddsTaken, resultStatus, profitUnits]

    ArenaScoreboard:
      type: object
      properties:
        agentId: { type: string, enum: [momentum_follower, contrarian] }
```

Replace with:

```yaml
    ArenaPosition:
      type: object
      properties:
        agentId: { type: string, enum: [momentum_follower, contrarian, kelly_criterion] }
        signalId: { type: string }
        matchId: { type: string }
        match: { type: string }
        side: { type: string, enum: [home, away] }
        target: { type: string }
        oddsTaken: { type: number }
        stakeUnits:
          type: number
          description: >
            Units staked on this position. Momentum Follower and Contrarian
            always stake exactly 1 (flat staking); Kelly Criterion varies
            this per position based on confidenceScore.
        resultStatus: { type: string, enum: [pending, correct, incorrect] }
        profitUnits: { type: number }
      required: [agentId, signalId, matchId, match, side, target, oddsTaken, stakeUnits, resultStatus, profitUnits]

    ArenaScoreboard:
      type: object
      properties:
        agentId: { type: string, enum: [momentum_follower, contrarian, kelly_criterion] }
```

- [ ] **Step 2: Update the `/api/arena` path**

Find:

```yaml
  /api/arena:
    get:
      summary: Agent vs Agent Arena head-to-head scoreboard
      description: >
        Two agents reading the same live 1X2 signal feed with opposite
        strategies: Momentum Follower takes every signal at face value;
        Contrarian fades signals that fire without real field support
        (fieldPressureScore < 22 at signal-creation time - a live, causal
        check, never the final match result). Over/Under totals signals do
        not participate. Settlement is tamper-evident (SHA-256 hash of both
        ledgers) and on-chain-verified (see proof.verifiableStat, checkable
        via GET /api/onchain/validate-stat) - this does not mean funds move
        or a smart contract executes; GoalPulse remains analytics only.
      responses:
        '200':
          description: Both agents' scoreboards and the tamper-evident proof.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: object
                    properties:
                      momentumFollower:
                        $ref: '#/components/schemas/ArenaScoreboard'
                      contrarian:
                        $ref: '#/components/schemas/ArenaScoreboard'
                      proof:
                        $ref: '#/components/schemas/ArenaProof'
                    required: [momentumFollower, contrarian, proof]
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'
```

Replace with:

```yaml
  /api/arena:
    get:
      summary: Agent vs Agent Arena head-to-head scoreboard
      description: >
        Three agents reading the same live 1X2 signal feed with different
        strategies: Momentum Follower takes every signal at face value;
        Contrarian fades signals that fire without real field support
        (fieldPressureScore < 22 at signal-creation time - a live, causal
        check, never the final match result); Kelly Criterion takes the
        same side as the signal but sizes its stake using the Kelly
        formula, deriving an implied edge from confidenceScore blended
        with the market's own implied probability. Over/Under totals
        signals do not participate in any of the three. Settlement is
        tamper-evident (SHA-256 hash of all three ledgers) and
        on-chain-verified (see proof.verifiableStat, checkable via GET
        /api/onchain/validate-stat) - this does not mean funds move or a
        smart contract executes; GoalPulse remains analytics only.
      responses:
        '200':
          description: All three agents' scoreboards and the tamper-evident proof.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: object
                    properties:
                      momentumFollower:
                        $ref: '#/components/schemas/ArenaScoreboard'
                      contrarian:
                        $ref: '#/components/schemas/ArenaScoreboard'
                      kellyCriterion:
                        $ref: '#/components/schemas/ArenaScoreboard'
                      proof:
                        $ref: '#/components/schemas/ArenaProof'
                    required: [momentumFollower, contrarian, kellyCriterion, proof]
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'
```

- [ ] **Step 3: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same pre-existing cosmetic warnings as before (no new errors).

- [ ] **Step 4: Commit**

```bash
git add openapi.yaml
git commit -m "Document Kelly Criterion agent in openapi.yaml"
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

Expected: all test files pass. Note the exact new total test count (was 147 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`, extend the existing Arena section (search for "Agent vs Agent Arena" or "Momentum Follower") to describe the third agent: the Kelly formula, the confidenceScore-to-edge derivation, the `MAX_EDGE`/`MAX_STAKE_FRACTION`/`KELLY_BANKROLL_UNITS` constants, and the `stakeUnits` schema change (and its ROI-correctness motivation) affecting all three agents. Reference the spec: `docs/superpowers/specs/2026-07-08-arena-kelly-criterion-design.md`.

In `SUBMISSION_NOTES.md`, add a new numbered entry under "Major Features Added This Session" (continuing from the existing "9. Composite Confidence Score and Signal-Type Performance" entry) describing the Kelly agent, including the "-0 vs +0" correctness detail found during design as a genuine finding worth mentioning (matching how prior entries there describe real findings).

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`: update the Arena feature-list bullet to mention three agents instead of two, and update the automated-test-count line to the real number measured in Step 1.

In `PROJECT_STATE.md`:
- Add a new dated entry (numbered continuing from the existing 10 feature entries) describing this feature: the schema change, the Kelly formula and its constants, and the `-0` fix.
- Update the test file count/number to match Step 1's real number (no new test *files* this task, only new tests within `arena.test.ts`).
- Update the handoff status block per the standing update-cadence instruction: mark #8 done, move to #9.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document Kelly Criterion Arena agent across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the entire branch's diff (all 6 tasks' commits together) before merging to `main` — do not merge without it.
