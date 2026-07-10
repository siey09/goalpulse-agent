# P1-1 Draw-Side Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-flowing `drawOdds` data into the full existing 1X2 pipeline — signal generation, settlement, steam detection, and Arena — so a draw-leaning market move can be detected, traded (by Momentum Follower/Kelly Criterion), and settled correctly, without inventing a Contrarian "opposite of a draw" heuristic.

**Architecture:** `TeamSide` widens from a 2-value to a 3-value union at the single source of truth (`types.ts`), then each consumer extends its existing binary logic to a 3-way equivalent. Contrarian gets an explicit early-return for draw signals rather than any new fade logic. Frontend changes are type-widening only — confirmed by investigation that no component has a binary `side === "home" ? X : Y` ternary that would mis-render a draw value.

**Tech Stack:** TypeScript, Vitest (backend), React/TypeScript (frontend, no test runner).

## Global Constraints

- Contrarian never trades draw signals — confirmed user decision, not a heuristic to build.
- `pinnedCaseStudies.ts`'s `PinnedCaseStudySide` type is explicitly NOT widened — it's a frozen historical-record type (same precedent as the OUTCOME_REJECTED_MOVE rename leaving `pinned-case-studies-raw.json` untouched); existing pinned records predate this feature and will never contain a draw value.
- `actionTeam` fields (`"home" | "away" | "neutral" | "unknown"`, in `SignalIntelligencePanel.tsx` and `pinnedCaseStudies.ts`) are a different concept (TXODDS Scores field-event indicator) — NOT touched, a field event can't legitimately be attributed to "draw."
- Verify backend with `npm run test && npm run build` from `apps/api` after each backend task; verify frontend with `npm run build` from `apps/web` after the frontend task.

---

### Task 1: `TeamSide` widening + 3-way signal generation

**Files:**
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/logic/signalEngine.ts`
- Modify: `apps/api/src/logic/signalEngine.test.ts`

**Interfaces:**
- Produces: `TeamSide = "home" | "away" | "draw"` — every other task in this plan consumes this widened type.

- [ ] **Step 1: Widen `TeamSide`**

In `apps/api/src/types.ts`, find:

```typescript
export type TeamSide = "home" | "away";
```

Replace with:

```typescript
export type TeamSide = "home" | "away" | "draw";
```

- [ ] **Step 2: Run the full backend build to see the ripple**

Run from `apps/api`: `npm run build`
Expected: succeeds with no errors — widening a union type is additive and doesn't break existing exhaustive-narrowing code (TypeScript doesn't error on an unhandled case unless a `switch` has a `default: assertNever` pattern, which this codebase doesn't use). This step is purely informational, confirming the type change alone is safe before touching logic.

- [ ] **Step 3: Write the failing `signalEngine.test.ts` test**

In `apps/api/src/logic/signalEngine.test.ts`, find:

```typescript
function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: overrides.id ?? "snapshot-1",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 2.0,
    drawOdds: 3.0,
    homeScore: 0,
    awayScore: 0,
    minute: 10,
    source: "txline",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
```

(No change needed here — `drawOdds: 3.0` is already a default field. Confirm this exact block exists before proceeding; if `drawOdds` is missing, add it as shown.)

Find:

```typescript
  it("classifies an 8-15% move as a MEDIUM severity MOMENTUM_SHIFT signal", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0 });
    // 2.0 -> 1.8 is a 10% compression.
    const current = makeSnapshot({ homeOdds: 1.8, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.severity).toBe("MEDIUM");
    expect(signal?.signalType).toBe("MOMENTUM_SHIFT");
  });
```

Insert immediately after it (still inside `describe("buildSignalFromSnapshots", ...)`):

```typescript

  it("selects the draw side when drawOdds compresses more than home or away", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0, drawOdds: 3.0 });
    // draw: 3.0 -> 2.4 is 20% compression, larger than any home/away move
    // (both unchanged here at 0%).
    const current = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0, drawOdds: 2.4 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.side).toBe("draw");
    expect(signal?.target).toBe("Draw");
    expect(signal?.oddsBefore).toBe(3.0);
    expect(signal?.oddsAfter).toBe(2.4);
    expect(signal?.oddsChangePct).toBe(20);
  });

  it("still selects home/away over draw when they compress more", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0, drawOdds: 3.0 });
    // home: 2.0 -> 1.5 is 25% compression, larger than draw's 10%
    // (3.0 -> 2.7).
    const current = makeSnapshot({ homeOdds: 1.5, awayOdds: 2.0, drawOdds: 2.7 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.side).toBe("home");
  });
```

- [ ] **Step 4: Run tests to verify the new ones fail**

Run from `apps/api`: `npx vitest run src/logic/signalEngine.test.ts`
Expected: `"selects the draw side..."` FAILS — `buildSignalFromSnapshots` doesn't compare `drawCompression` yet, so `side` comes back `"home"` (home/away tie at 0%, and the existing `homeCompression >= awayCompression` tie-break picks home) instead of `"draw"`. `"still selects home/away over draw..."` PASSES already (home legitimately wins today since draw isn't compared at all) — a real regression check once Step 5 adds the 3-way comparison, not evidence of a bug yet.

- [ ] **Step 5: Implement the 3-way comparison in `signalEngine.ts`**

Find:

```typescript
export function buildSignalFromSnapshots(
  current: OddsSnapshot,
  previous: OddsSnapshot | undefined
): AgentSignal | null {
  if (!previous) return null;

  const homeCompression = calculateCompressionPct(
    previous.homeOdds,
    current.homeOdds
  );

  const awayCompression = calculateCompressionPct(
    previous.awayOdds,
    current.awayOdds
  );

  const side: TeamSide = homeCompression >= awayCompression ? "home" : "away";
  const bestChangePct = side === "home" ? homeCompression : awayCompression;

  const severity = getSeverity(bestChangePct);

  if (severity === "NONE") return null;

  const scoreChanged =
    previous.homeScore !== current.homeScore ||
    previous.awayScore !== current.awayScore;

  const target = side === "home" ? current.homeTeam : current.awayTeam;
  const oddsBefore = side === "home" ? previous.homeOdds : previous.awayOdds;
  const oddsAfter = side === "home" ? current.homeOdds : current.awayOdds;
```

Replace with:

```typescript
export function buildSignalFromSnapshots(
  current: OddsSnapshot,
  previous: OddsSnapshot | undefined
): AgentSignal | null {
  if (!previous) return null;

  const homeCompression = calculateCompressionPct(
    previous.homeOdds,
    current.homeOdds
  );

  const awayCompression = calculateCompressionPct(
    previous.awayOdds,
    current.awayOdds
  );

  const drawCompression = calculateCompressionPct(
    previous.drawOdds,
    current.drawOdds
  );

  const side: TeamSide =
    homeCompression >= drawCompression && homeCompression >= awayCompression
      ? "home"
      : drawCompression >= awayCompression
        ? "draw"
        : "away";

  const bestChangePct =
    side === "home" ? homeCompression : side === "draw" ? drawCompression : awayCompression;

  const severity = getSeverity(bestChangePct);

  if (severity === "NONE") return null;

  const scoreChanged =
    previous.homeScore !== current.homeScore ||
    previous.awayScore !== current.awayScore;

  const target = side === "home" ? current.homeTeam : side === "draw" ? "Draw" : current.awayTeam;
  const oddsBefore = side === "home" ? previous.homeOdds : side === "draw" ? previous.drawOdds : previous.awayOdds;
  const oddsAfter = side === "home" ? current.homeOdds : side === "draw" ? current.drawOdds : current.awayOdds;
```

- [ ] **Step 6: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/logic/signalEngine.test.ts`
Expected: PASS, every test in the file green (all pre-existing tests use identical home/away odds across previous/current for whichever side they're not testing, and `drawOdds` defaults to `3.0` unchanged in most of them — so `drawCompression` is `0` and never wins against a real intended home/away move).

- [ ] **Step 7: Full backend test run and build**

Run from `apps/api`: `npm run test && npm run build`
Expected: all tests pass, clean build.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/logic/signalEngine.ts apps/api/src/logic/signalEngine.test.ts
git commit -m "Widen TeamSide to include draw, extend signal generation to 3-way (P1-1)"
```

---

### Task 2: Settlement — draw outcome

**Files:**
- Modify: `apps/api/src/store.ts`
- Modify: `apps/api/src/store.test.ts`

**Interfaces:**
- Consumes: `TeamSide` including `"draw"` from Task 1.

- [ ] **Step 1: Write the failing settlement tests**

In `apps/api/src/store.test.ts`, find:

```typescript
describe("evaluatePendingSignalsForFinishedMatches — 1X2 market", () => {
  it("marks a home-side signal correct when the home team wins", () => {
    store.matches = [makeMatch({ homeScore: 2, awayScore: 0 })];
    store.signals = [makeSignal({ side: "home", target: "Team A" })];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("correct");
  });
```

Insert immediately after this test (still inside the same `describe`, before the next `it`):

```typescript

  it("marks a draw-side signal correct when the match ends level", () => {
    store.matches = [makeMatch({ homeScore: 1, awayScore: 1 })];
    store.signals = [makeSignal({ side: "draw", target: "Draw" })];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("correct");
  });

  it("marks a draw-side signal incorrect when the match has a winner", () => {
    store.matches = [makeMatch({ homeScore: 2, awayScore: 1 })];
    store.signals = [makeSignal({ side: "draw", target: "Draw" })];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("incorrect");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `apps/api`: `npx vitest run src/store.test.ts`
Expected: `"marks a draw-side signal correct..."` FAILS — the current settlement logic's `signalWon` is `false` for any `side` other than `"home"`/`"away"`, so a draw signal always settles `"incorrect"` even on a real draw. `"marks a draw-side signal incorrect..."` PASSES already (correctly incorrect, but for the wrong reason — no draw handling exists at all yet).

- [ ] **Step 3: Implement the draw branch in `store.ts`**

Find:

```typescript
    } else {
      const homeWon = match.homeScore > match.awayScore;
      const awayWon = match.awayScore > match.homeScore;
      signalWon =
        (signal.side === "home" && homeWon) || (signal.side === "away" && awayWon);
    }
```

Replace with:

```typescript
    } else {
      const homeWon = match.homeScore > match.awayScore;
      const awayWon = match.awayScore > match.homeScore;
      const isDraw = match.homeScore === match.awayScore;
      signalWon =
        (signal.side === "home" && homeWon) ||
        (signal.side === "away" && awayWon) ||
        (signal.side === "draw" && isDraw);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/store.test.ts`
Expected: PASS, every test in the file green.

- [ ] **Step 5: Full backend test run and build**

Run from `apps/api`: `npm run test && npm run build`
Expected: all tests pass, clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/store.ts apps/api/src/store.test.ts
git commit -m "Settle draw-side signals correctly (P1-1)"
```

---

### Task 3: Steam Move Detection — extend to draw

**Files:**
- Modify: `apps/api/src/logic/steamDetection.ts`
- Modify: `apps/api/src/logic/steamDetection.test.ts`

**Interfaces:**
- Consumes: `TeamSide` including `"draw"` from Task 1.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/logic/steamDetection.test.ts`, find:

```typescript
  it("detects a steam move on the away side when the home side is flat", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(60), homeOdds: 2.0, awayOdds: 2.94 }),
      makeSnapshot({ id: "s2", createdAt: iso(120), homeOdds: 2.0, awayOdds: 2.85 }),
      makeSnapshot({ id: "s3", createdAt: iso(180), homeOdds: 2.0, awayOdds: 2.73 }),
    ];

    const result = detectSteamMove(snapshots);

    expect(result).not.toBeNull();
    expect(result?.side).toBe("away");
    expect(result?.tickCount).toBe(3);
  });
```

Insert immediately after it (still inside `describe("detectSteamMove", ...)`):

```typescript

  it("detects a steam move on the draw side when home and away are flat", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0, awayOdds: 3.0, drawOdds: 3.25 }),
      makeSnapshot({ id: "s1", createdAt: iso(60), homeOdds: 2.0, awayOdds: 3.0, drawOdds: 3.19 }),
      makeSnapshot({ id: "s2", createdAt: iso(120), homeOdds: 2.0, awayOdds: 3.0, drawOdds: 3.09 }),
      makeSnapshot({ id: "s3", createdAt: iso(180), homeOdds: 2.0, awayOdds: 3.0, drawOdds: 2.96 }),
    ];

    const result = detectSteamMove(snapshots);

    expect(result).not.toBeNull();
    expect(result?.side).toBe("draw");
    expect(result?.tickCount).toBe(3);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/api`: `npx vitest run src/logic/steamDetection.test.ts`
Expected: FAIL — `detectSteamMove` never checks `drawOdds`, so it returns `null` (no home/away move present in this fixture).

- [ ] **Step 3: Implement the 3-way extension in `steamDetection.ts`**

Find:

```typescript
function oddsForSide(snapshot: OddsSnapshot, side: TeamSide): number {
  return side === "home" ? snapshot.homeOdds : snapshot.awayOdds;
}
```

Replace with:

```typescript
function oddsForSide(snapshot: OddsSnapshot, side: TeamSide): number {
  if (side === "home") return snapshot.homeOdds;
  if (side === "draw") return snapshot.drawOdds;
  return snapshot.awayOdds;
}
```

Find:

```typescript
export function detectSteamMove(snapshots: OddsSnapshot[]): SteamMove | null {
  if (snapshots.length < MIN_CONSECUTIVE_MOVES + 1) return null;

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return findSteamForSide(sorted, "home") ?? findSteamForSide(sorted, "away");
}
```

Replace with:

```typescript
export function detectSteamMove(snapshots: OddsSnapshot[]): SteamMove | null {
  if (snapshots.length < MIN_CONSECUTIVE_MOVES + 1) return null;

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    findSteamForSide(sorted, "home") ??
    findSteamForSide(sorted, "draw") ??
    findSteamForSide(sorted, "away")
  );
}
```

Also update the function's doc comment. Find:

```typescript
/**
 * Detects sustained same-direction pressure across a SEQUENCE of ticks -
 * distinct from the existing signal engine, which only ever compares the
 * single latest tick to the one immediately before it. Only the trailing
 * (most recent) run is considered - this answers "is a steam move
 * happening right now," not a historical scan. Checks home first, then
 * away; a match moving on both sides simultaneously is not expected given
 * how compression is calculated, so at most one SteamMove is returned per
 * call. matchId/match display fields are derived directly from the
 * snapshots themselves (matchLabel if present, otherwise homeTeam/awayTeam)
 * - no separate Match lookup needed, which sidesteps the totals-matchId
 * suffix problem entirely.
 */
```

Replace with:

```typescript
/**
 * Detects sustained same-direction pressure across a SEQUENCE of ticks -
 * distinct from the existing signal engine, which only ever compares the
 * single latest tick to the one immediately before it. Only the trailing
 * (most recent) run is considered - this answers "is a steam move
 * happening right now," not a historical scan. Checks home, then draw,
 * then away; a match moving on multiple sides simultaneously is not
 * expected given how compression is calculated, so at most one SteamMove
 * is returned per call. matchId/match display fields are derived directly
 * from the snapshots themselves (matchLabel if present, otherwise
 * homeTeam/awayTeam) - no separate Match lookup needed, which sidesteps
 * the totals-matchId suffix problem entirely.
 */
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/logic/steamDetection.test.ts`
Expected: PASS, every test in the file green.

- [ ] **Step 5: Full backend test run and build**

Run from `apps/api`: `npm run test && npm run build`
Expected: all tests pass, clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/logic/steamDetection.ts apps/api/src/logic/steamDetection.test.ts
git commit -m "Extend Steam Move Detection to the draw side (P1-1)"
```

---

### Task 4: Arena — Contrarian skips draw signals

**Files:**
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/logic/arena.ts`
- Modify: `apps/api/src/logic/arena.test.ts`

**Interfaces:**
- Produces: `RejectionReason` gains `"draw_signal"`.
- No signature changes to `buildMomentumFollowerPosition`, `buildKellyCriterionPosition`, or `buildContrarianPosition` — same as every prior Arena change this session.

- [ ] **Step 1: Add the new rejection reason to the type**

In `apps/api/src/types.ts`, find:

```typescript
export type RejectionReason =
  | "totals_signal"
  | "not_market_only_move"
  | "no_original_snapshot";
```

Replace with:

```typescript
export type RejectionReason =
  | "totals_signal"
  | "not_market_only_move"
  | "no_original_snapshot"
  | "draw_signal";
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/logic/arena.test.ts`, find:

```typescript
  it("returns null for contrarian on a tradeable market-only move with a snapshot", () => {
    const signal = makeSignal({
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 5 } },
    });

    expect(getRejectionReason("contrarian", signal, makeSnapshot())).toBeNull();
  });
});
```

Replace with:

```typescript
  it("returns null for contrarian on a tradeable market-only move with a snapshot", () => {
    const signal = makeSignal({
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 5 } },
    });

    expect(getRejectionReason("contrarian", signal, makeSnapshot())).toBeNull();
  });

  it("returns a draw_signal rejection for contrarian on a draw signal", () => {
    const signal = makeSignal({ side: "draw", target: "Draw" });

    const result = getRejectionReason("contrarian", signal, makeSnapshot());

    expect(result?.reason).toBe("draw_signal");
  });

  it("returns null for momentum_follower on a draw signal (only contrarian rejects draws)", () => {
    const signal = makeSignal({ side: "draw", target: "Draw" });

    expect(getRejectionReason("momentum_follower", signal, undefined)).toBeNull();
  });
});
```

Then find:

```typescript
describe("buildContrarianPosition", () => {
```

Locate the last test in this describe block (search for the block's final `});` before the next top-level `describe`), and insert a new test immediately before that closing `});` of the describe block:

```typescript

  it("returns null for a draw signal, even when it would otherwise be a tradeable market-only move", () => {
    const signal = makeSignal({
      side: "draw",
      target: "Draw",
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 5 } },
    });
    const snapshot = makeSnapshot();
    const match = makeMatch({ status: "finished" });

    expect(buildContrarianPosition(signal, match, snapshot)).toBeNull();
  });
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run from `apps/api`: `npx vitest run src/logic/arena.test.ts`
Expected: `"returns a draw_signal rejection..."` FAILS (gets `null` instead of a `draw_signal` reason, since `getRejectionReason` doesn't check for draw signals yet). `"returns null for a draw signal, even when it would otherwise be tradeable..."` FAILS (currently `buildContrarianPosition` has no draw check, so `isMarketOnlyMove` passes at `fieldPressureScore: 5` and a position is built instead of returning `null`). `"returns null for momentum_follower on a draw signal..."` PASSES already (momentum_follower was never going to reject a draw signal in the first place, since only totals triggers a momentum_follower rejection) — a real regression check once Step 4 lands, confirming the fix doesn't overreach into non-Contrarian agents.

- [ ] **Step 4: Implement in `arena.ts`**

Find:

```typescript
export function buildContrarianPosition(
  signal: AgentSignal,
  match: Match | undefined,
  originalSnapshot: OddsSnapshot | undefined
): ArenaPosition | null {
  if (isTotalsSignal(signal)) return null;
  if (!isMarketOnlyMove(signal)) return null;
  if (!originalSnapshot) return null;
```

Replace with:

```typescript
export function buildContrarianPosition(
  signal: AgentSignal,
  match: Match | undefined,
  originalSnapshot: OddsSnapshot | undefined
): ArenaPosition | null {
  if (isTotalsSignal(signal)) return null;
  if (signal.side === "draw") return null;
  if (!isMarketOnlyMove(signal)) return null;
  if (!originalSnapshot) return null;
```

Find:

```typescript
  if (agentId !== "contrarian") return null;

  if (!isMarketOnlyMove(signal)) {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "not_market_only_move",
      reasonText: "Field-backed move — Contrarian only fades market-only moves.",
    };
  }
```

Replace with:

```typescript
  if (agentId !== "contrarian") return null;

  if (signal.side === "draw") {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "draw_signal",
      reasonText: "Draw signal — Contrarian has no principled opposite in a 3-outcome market.",
    };
  }

  if (!isMarketOnlyMove(signal)) {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "not_market_only_move",
      reasonText: "Field-backed move — Contrarian only fades market-only moves.",
    };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/logic/arena.test.ts`
Expected: PASS, every test in the file green.

- [ ] **Step 6: Full backend test run and build**

Run from `apps/api`: `npm run test && npm run build`
Expected: all tests pass, clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/logic/arena.ts apps/api/src/logic/arena.test.ts
git commit -m "Contrarian skips draw signals via a new rejection reason (P1-1)"
```

---

### Task 5: Frontend type widening

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/ArenaPanel.tsx`
- Modify: `apps/web/src/components/SignalArchivePanel.tsx`
- Modify: `apps/web/src/components/SignalCorrelationPanel.tsx`
- Modify: `apps/web/src/components/SteamMoveDetectionPanel.tsx`

**Interfaces:**
- No behavior change — pure type widening. `pinnedCaseStudies.ts`'s `PinnedCaseStudySide` and any `actionTeam` field are explicitly NOT touched (see Global Constraints).

- [ ] **Step 1: Widen `side` in `api.ts`**

Find:

```typescript
  side: "home" | "away";
```

(this appears once in `apps/web/src/api.ts` — confirm via context that it's the signal-side field, matching `signalType: "SHARP_MOVE" | "WATCH" | "MOMENTUM_SHIFT" | "NO_ACTION";` on the next line, not an unrelated field). Replace with:

```typescript
  side: "home" | "away" | "draw";
```

- [ ] **Step 2: Widen `side` in `App.tsx`**

Find:

```typescript
  type SteamMoveReply = {
    match: string;
    side: "home" | "away";
    tickCount: number;
```

Replace with:

```typescript
  type SteamMoveReply = {
    match: string;
    side: "home" | "away" | "draw";
    tickCount: number;
```

- [ ] **Step 3: Widen `side` in `ArenaPanel.tsx`**

Find:

```typescript
  signalId: string;
  matchId: string;
  match: string;
  side: "home" | "away";
  target: string;
```

Replace with:

```typescript
  signalId: string;
  matchId: string;
  match: string;
  side: "home" | "away" | "draw";
  target: string;
```

Also widen the `ArenaRejection` type's `reason` field. Find:

```typescript
type ArenaRejection = {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  reason: "totals_signal" | "not_market_only_move" | "no_original_snapshot";
  reasonText: string;
};
```

Replace with:

```typescript
type ArenaRejection = {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  reason: "totals_signal" | "not_market_only_move" | "no_original_snapshot" | "draw_signal";
  reasonText: string;
};
```

- [ ] **Step 4: Widen `side` in `SignalArchivePanel.tsx`**

Find:

```typescript
  signalId: string;
  event: "created" | "settled";
  matchId: string;
  side: "home" | "away";
  signalType: string;
```

Replace with:

```typescript
  signalId: string;
  event: "created" | "settled";
  matchId: string;
  side: "home" | "away" | "draw";
  signalType: string;
```

- [ ] **Step 5: Widen `side` in `SignalCorrelationPanel.tsx`**

Find:

```typescript
type PatternCluster = {
  side: "home" | "away";
  severity: "HIGH" | "MEDIUM" | "LOW";
```

Replace with:

```typescript
type PatternCluster = {
  side: "home" | "away" | "draw";
  severity: "HIGH" | "MEDIUM" | "LOW";
```

- [ ] **Step 6: Widen `side` in `SteamMoveDetectionPanel.tsx`**

Find:

```typescript
type SteamMove = {
  matchId: string;
  match: string;
  side: "home" | "away";
  tickCount: number;
```

Replace with:

```typescript
type SteamMove = {
  matchId: string;
  match: string;
  side: "home" | "away" | "draw";
  tickCount: number;
```

- [ ] **Step 7: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 8: Manual verification against a running dev server**

Start the local backend (`npm run dev:once` in `apps/api`) and frontend (`npm run dev` in `apps/web`), open the app. Confirm no console errors on the panels touched above (Arena, Signal Archive, Signal Correlation, Steam Move Detection). If a real draw signal has fired in the current live/simulated data (check `curl -s http://localhost:4000/api/signals | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.data.filter(s=>s.side==='draw').length, 'draw signal(s)')"`), visually confirm it renders correctly (readable "Draw" target, no broken layout) wherever it appears. If none exist yet, that's expected — the backend unit tests already prove the logic; live confirmation happens whenever a real draw signal next fires, same pattern as P1-2's longshot verification. Stop both local dev servers after checking (exact PIDs, not pattern-kill).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/App.tsx apps/web/src/components/ArenaPanel.tsx apps/web/src/components/SignalArchivePanel.tsx apps/web/src/components/SignalCorrelationPanel.tsx apps/web/src/components/SteamMoveDetectionPanel.tsx
git commit -m "Widen frontend side types to include draw (P1-1)"
```

---

### Task 6: PROJECT_STATE.md update

**Files:**
- Modify: `PROJECT_STATE.md`

- [ ] **Step 1: Document P1-1 completion**

Add an entry to `PROJECT_STATE.md`'s session-handoff section covering: the 3-way signal generation extension, draw settlement, Steam Move Detection extension, Contrarian's draw-skip rejection reason, the frontend type-widening scope (and what was explicitly excluded — `pinnedCaseStudies.ts`, `actionTeam` fields), test/build counts actually observed across Tasks 1-5, and next action (report diff, user finds or waits for a real draw signal live in production, then explicitly approves before push and before P1-7).

- [ ] **Step 2: Commit**

```bash
git add PROJECT_STATE.md
git commit -m "Update PROJECT_STATE.md: P1-1 implemented, awaiting review"
```

---

## Final Verification

- [ ] Run `npm run test && npm run build` from `apps/api` — all green, clean build.
- [ ] Run `npm run build` from `apps/web` — clean build.
- [ ] Confirm draw-side signal generation, settlement, steam detection, and Contrarian's rejection all work correctly via unit tests (live production confirmation depends on a real draw-leaning move firing, which the user will check for, same pattern as P1-2).
- [ ] Report the full diff to the user for review — do not push until they explicitly say to. This is the first item in the user's full remaining-rollout sequencing — do not start P1-7 without their explicit go-ahead.
