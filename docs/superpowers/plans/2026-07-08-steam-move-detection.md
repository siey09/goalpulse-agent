# Steam Move Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/steam-moves`, detecting sustained same-direction odds pressure across a *sequence* of consecutive ticks for a match/side — distinct from the existing signal engine, which only ever compares exactly two snapshots.

**Architecture:** A new pure module, `logic/steamDetection.ts`, scans a single match's chronologically-sorted odds-snapshot history for a trailing run of consecutive same-direction moves. `server.ts` wires it into one new route that groups `store.oddsSnapshots` by `matchId` and calls the detector per group — read-only, computed live, never mutates `agent.ts`/`store.ts`'s state.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-steam-move-detection-design.md`

## Global Constraints

- **Redefinition (confirmed, do not revisit):** TxLINE's feed is Stable Price consensus pricing, not multi-bookmaker data — "steam" here means a sequence of consecutive same-direction ticks within one consensus feed, not cross-book agreement. Recorded in `PROJECT_STATE.md`'s Architecture section.
- Minimum 3 consecutive same-direction moves, each ≥1% compression, spanning ≤5 minutes (`STEAM_WINDOW_MS = 5 * 60 * 1000`) from the run's first to last tick.
- Only the **trailing** (most recent) run is considered per side — not a historical scan for streaks buried earlier in the history.
- Checks home side first, then away side; returns at most one `SteamMove` per `detectSteamMove` call (per match/snapshot-group).
- `matchId`/`match` display fields are derived directly from the snapshots themselves (`matchLabel` if present, else `homeTeam`/`awayTeam`) — no separate `Match` lookup, sidestepping the totals-matchId suffix problem.
- Applies to both 1X2 and Over/Under totals lines (grouping by literal `matchId` naturally keeps them separate, matching the existing multi-market isolation convention).
- New route is a public GET, no API key, covered by the existing general rate limiter.
- Test runner: Vitest, run from `apps/api/` via `npm run test` (or `npx vitest run <path>` for a single file).
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged.

---

### Task 1: `detectSteamMove` in `logic/steamDetection.ts`

**Files:**
- Create: `apps/api/src/logic/steamDetection.ts`
- Create: `apps/api/src/logic/steamDetection.test.ts`

**Interfaces:**
- Consumes: `OddsSnapshot`, `TeamSide` (existing, `../types`).
- Produces: `SteamMove` type, `detectSteamMove(snapshots: OddsSnapshot[]): SteamMove | null`, `STEAM_WINDOW_MS` constant — all consumed by Task 2 (`server.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/logic/steamDetection.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { detectSteamMove } from "./steamDetection";
import type { OddsSnapshot } from "../types";

const BASE_TIME = new Date("2026-07-08T12:00:00.000Z").getTime();

function iso(secondsFromStart: number): string {
  return new Date(BASE_TIME + secondsFromStart * 1000).toISOString();
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snap",
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
    createdAt: iso(0),
    ...overrides,
  };
}

describe("detectSteamMove", () => {
  it("returns null when there are too few snapshots to evaluate", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(30), homeOdds: 1.9 }),
    ];

    expect(detectSteamMove(snapshots)).toBeNull();
  });

  it("returns null when the trailing run has fewer than 3 consecutive qualifying moves", () => {
    // 3 possible moves, but only the last 2 qualify (>=1%) - the first move
    // (2.00 -> 1.99, 0.5%) breaks the streak, so the trailing run is only 2
    // long, one short of the required 3. This exercises the "moves don't
    // qualify" branch distinctly from having too few snapshots to evaluate
    // at all (covered by the previous test).
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(30), homeOdds: 1.99, awayOdds: 3.0 }),
      makeSnapshot({ id: "s2", createdAt: iso(60), homeOdds: 1.94, awayOdds: 3.0 }),
      makeSnapshot({ id: "s3", createdAt: iso(90), homeOdds: 1.88, awayOdds: 3.0 }),
    ];

    expect(detectSteamMove(snapshots)).toBeNull();
  });

  it("detects a steam move on the home side", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(60), homeOdds: 1.98, awayOdds: 3.0 }),
      makeSnapshot({ id: "s2", createdAt: iso(120), homeOdds: 1.94, awayOdds: 3.0 }),
      makeSnapshot({ id: "s3", createdAt: iso(180), homeOdds: 1.88, awayOdds: 3.0 }),
    ];

    const result = detectSteamMove(snapshots);

    expect(result).not.toBeNull();
    expect(result?.side).toBe("home");
    expect(result?.tickCount).toBe(3);
    expect(result?.firstOdds).toBe(2.0);
    expect(result?.lastOdds).toBe(1.88);
    expect(result?.totalMovePct).toBe(6);
    expect(result?.windowMs).toBe(180000);
    expect(result?.matchId).toBe("match-1");
    expect(result?.match).toBe("Team A vs Team B");
  });

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

  it("returns null when a qualifying streak's window exceeds 5 minutes", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(60), homeOdds: 1.98, awayOdds: 3.0 }),
      makeSnapshot({ id: "s2", createdAt: iso(120), homeOdds: 1.94, awayOdds: 3.0 }),
      makeSnapshot({ id: "s3", createdAt: iso(400), homeOdds: 1.88, awayOdds: 3.0 }),
    ];

    expect(detectSteamMove(snapshots)).toBeNull();
  });

  it("only counts the trailing run after a break, ignoring an earlier isolated qualifying move", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.2, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(30), homeOdds: 2.15, awayOdds: 3.0 }),
      makeSnapshot({ id: "s2", createdAt: iso(60), homeOdds: 2.148, awayOdds: 3.0 }),
      makeSnapshot({ id: "s3", createdAt: iso(90), homeOdds: 2.1, awayOdds: 3.0 }),
      makeSnapshot({ id: "s4", createdAt: iso(120), homeOdds: 2.05, awayOdds: 3.0 }),
      makeSnapshot({ id: "s5", createdAt: iso(150), homeOdds: 2.0, awayOdds: 3.0 }),
    ];

    const result = detectSteamMove(snapshots);

    expect(result).not.toBeNull();
    expect(result?.tickCount).toBe(3);
    expect(result?.firstOdds).toBe(2.148);
    expect(result?.lastOdds).toBe(2.0);
    expect(result?.firstTickAt).toBe(iso(60));
    expect(result?.lastTickAt).toBe(iso(150));
  });

  it("uses matchLabel over homeTeam/awayTeam when present (totals-market case)", () => {
    const snapshots = [
      makeSnapshot({
        id: "s0",
        createdAt: iso(0),
        matchId: "wc-usa-bra-totals-3.5",
        homeTeam: "Over 3.5",
        awayTeam: "Under 3.5",
        matchLabel: "USA vs Brazil",
        homeOdds: 2.0,
        awayOdds: 3.0,
      }),
      makeSnapshot({
        id: "s1",
        createdAt: iso(60),
        matchId: "wc-usa-bra-totals-3.5",
        homeTeam: "Over 3.5",
        awayTeam: "Under 3.5",
        matchLabel: "USA vs Brazil",
        homeOdds: 1.98,
        awayOdds: 3.0,
      }),
      makeSnapshot({
        id: "s2",
        createdAt: iso(120),
        matchId: "wc-usa-bra-totals-3.5",
        homeTeam: "Over 3.5",
        awayTeam: "Under 3.5",
        matchLabel: "USA vs Brazil",
        homeOdds: 1.94,
        awayOdds: 3.0,
      }),
      makeSnapshot({
        id: "s3",
        createdAt: iso(180),
        matchId: "wc-usa-bra-totals-3.5",
        homeTeam: "Over 3.5",
        awayTeam: "Under 3.5",
        matchLabel: "USA vs Brazil",
        homeOdds: 1.88,
        awayOdds: 3.0,
      }),
    ];

    const result = detectSteamMove(snapshots);

    expect(result).not.toBeNull();
    expect(result?.matchId).toBe("wc-usa-bra-totals-3.5");
    expect(result?.match).toBe("USA vs Brazil");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/steamDetection.test.ts
```

Expected: FAIL — `Cannot find module './steamDetection'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/logic/steamDetection.ts`:

```typescript
import type { OddsSnapshot, TeamSide } from "../types";

const MIN_CONSECUTIVE_MOVES = 3;
const MIN_TICK_MOVE_PCT = 1;

export const STEAM_WINDOW_MS = 5 * 60 * 1000;

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function compressionPct(previousOdds: number, currentOdds: number): number {
  return ((previousOdds - currentOdds) / previousOdds) * 100;
}

function oddsForSide(snapshot: OddsSnapshot, side: TeamSide): number {
  return side === "home" ? snapshot.homeOdds : snapshot.awayOdds;
}

export interface SteamMove {
  matchId: string;
  match: string;
  side: TeamSide;
  tickCount: number;
  totalMovePct: number;
  windowMs: number;
  firstOdds: number;
  lastOdds: number;
  firstTickAt: string;
  lastTickAt: string;
}

function findSteamForSide(sorted: OddsSnapshot[], side: TeamSide): SteamMove | null {
  let streakLength = 0;

  for (let i = sorted.length - 1; i > 0; i -= 1) {
    const movePct = compressionPct(
      oddsForSide(sorted[i - 1], side),
      oddsForSide(sorted[i], side)
    );

    if (movePct >= MIN_TICK_MOVE_PCT) {
      streakLength += 1;
    } else {
      break;
    }
  }

  if (streakLength < MIN_CONSECUTIVE_MOVES) return null;

  const runStartIndex = sorted.length - 1 - streakLength;
  const runStart = sorted[runStartIndex];
  const runEnd = sorted[sorted.length - 1];

  const windowMs = new Date(runEnd.createdAt).getTime() - new Date(runStart.createdAt).getTime();
  if (windowMs > STEAM_WINDOW_MS) return null;

  const firstOdds = oddsForSide(runStart, side);
  const lastOdds = oddsForSide(runEnd, side);

  return {
    matchId: runEnd.matchId,
    match: runEnd.matchLabel ?? `${runEnd.homeTeam} vs ${runEnd.awayTeam}`,
    side,
    tickCount: streakLength,
    totalMovePct: round(compressionPct(firstOdds, lastOdds)),
    windowMs,
    firstOdds,
    lastOdds,
    firstTickAt: runStart.createdAt,
    lastTickAt: runEnd.createdAt,
  };
}

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
export function detectSteamMove(snapshots: OddsSnapshot[]): SteamMove | null {
  if (snapshots.length < MIN_CONSECUTIVE_MOVES + 1) return null;

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return findSteamForSide(sorted, "home") ?? findSteamForSide(sorted, "away");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/steamDetection.test.ts
```

Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/steamDetection.ts apps/api/src/logic/steamDetection.test.ts
git commit -m "Add pure steam move detection over a single match's tick history"
```

---

### Task 2: Register `GET /api/steam-moves` in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `detectSteamMove`, `SteamMove` (Task 1, `./logic/steamDetection`).
- Produces: the live `GET /api/steam-moves` route, consumed by Task 3 (openapi.yaml documentation).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, add this import line right after the existing `import { assessBandBreach, summarizeBandBreaches } from "./logic/marketConfirmation";` / `import type { BandBreachResult } from "./logic/marketConfirmation";` lines:

```typescript
import { detectSteamMove } from "./logic/steamDetection";
import type { SteamMove } from "./logic/steamDetection";
```

- [ ] **Step 2: Add the route**

Find this exact block in `apps/api/src/server.ts` (the end of the `GET /api/market-maker/confirmations` route):

```typescript
  res.json({
    data: results,
    summary: summarizeBandBreaches(results),
  });
});
```

Add this new route immediately after it:

```typescript
  res.json({
    data: results,
    summary: summarizeBandBreaches(results),
  });
});

app.get("/api/steam-moves", (_req, res) => {
  const snapshotsByMatchId = new Map<string, OddsSnapshot[]>();

  for (const snapshot of store.oddsSnapshots) {
    const existing = snapshotsByMatchId.get(snapshot.matchId) ?? [];
    existing.push(snapshot);
    snapshotsByMatchId.set(snapshot.matchId, existing);
  }

  const steamMoves: SteamMove[] = [];

  for (const snapshots of snapshotsByMatchId.values()) {
    const steamMove = detectSteamMove(snapshots);
    if (steamMove) steamMoves.push(steamMove);
  }

  res.json({
    data: steamMoves,
    summary: {
      matchesScanned: snapshotsByMatchId.size,
      steamMovesDetected: steamMoves.length,
    },
  });
});
```

(`OddsSnapshot` is already imported in `server.ts` via `import type { OddsSnapshot } from "./types";`.)

- [ ] **Step 3: Verify the project builds**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no type errors.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass, total test count higher than the pre-existing 119.

- [ ] **Step 5: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`), then in another terminal:

```bash
curl -s "http://localhost:4000/api/steam-moves" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log('summary:', JSON.stringify(body.summary, null, 2));
  console.log('data:', JSON.stringify(body.data, null, 2));
});
"
```

Expected: `summary.matchesScanned` equals the number of distinct `matchId` values currently in `store.oddsSnapshots`, and `summary.steamMovesDetected` equals `body.data.length`. The simulated feed's short polling interval and limited odds movement may or may not produce a real steam move during a short manual check — an empty `data: []` with a nonzero `matchesScanned` is a valid, expected result, not a bug.

Stop the dev server afterward by finding its PID (`netstat -ano | grep ":4000.*LISTENING"` on Windows), confirming via its command line that it's the one you started, and killing that exact PID; prefer an alternate port (e.g. `PORT=4040 npm run dev`) if port 4000 is already occupied by something you didn't start.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Register GET /api/steam-moves route"
```

---

### Task 3: Document `GET /api/steam-moves` in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: the route from Task 2 (documents actual behavior; no code dependency).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the path**

Find this exact block (the end of the `/api/market-maker/confirmations` path, right before `/api/onchain/validate-stat`):

```yaml
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

Replace with:

```yaml
                      totalChecked: { type: number }
                      confirmedCount: { type: number }
                      unconfirmedCount: { type: number }
                      confirmationRatePct: { type: number }
                    required: [totalChecked, confirmedCount, unconfirmedCount, confirmationRatePct]
                required: [data, summary]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/steam-moves:
    get:
      summary: Sustained same-direction odds pressure across a tick sequence
      description: >
        Detects a trailing run of 3+ consecutive same-direction odds ticks
        (each at least 1% compression, spanning no more than 5 minutes
        first-to-last) for a match/side - distinct from the core signal
        engine, which only ever compares exactly two snapshots. TxLINE's
        feed is Stable Price consensus pricing, not multi-bookmaker data,
        so this detects sustained pressure within the single consensus
        feed rather than cross-book agreement. Applies to both 1X2 and
        Over/Under totals lines.
      responses:
        '200':
          description: Currently detected steam moves, plus a scan summary.
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
                        matchId: { type: string }
                        match: { type: string }
                        side: { type: string }
                        tickCount: { type: number }
                        totalMovePct: { type: number }
                        windowMs: { type: number }
                        firstOdds: { type: number }
                        lastOdds: { type: number }
                        firstTickAt: { type: string, format: date-time }
                        lastTickAt: { type: string, format: date-time }
                      required: [matchId, match, side, tickCount, totalMovePct, windowMs, firstOdds, lastOdds, firstTickAt, lastTickAt]
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

- [ ] **Step 2: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same pre-existing cosmetic `operationId` warnings as before (no new errors).

- [ ] **Step 3: Commit**

```bash
git add openapi.yaml
git commit -m "Document GET /api/steam-moves in openapi.yaml"
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

Expected: all test files pass. Note the exact new total test count (was 119 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`, add a new section (after "Market Maker Double-Confirmation Cross-Check") describing steam detection: the redefinition from the original multi-book framing (with a one-line pointer to the confirmed Stable Price fact already recorded in `PROJECT_STATE.md`), the detection rule (3+ moves, ≥1% each, ≤5 min), and the new endpoint. Add `logic/steamDetection.ts` to the "Important backend files" list.

In `SUBMISSION_NOTES.md`, add a matching entry under "Major Features Added This Session" (numbered continuing from the existing "6. Market Maker Double-Confirmation Cross-Check" entry) describing the same feature in the narrative style already used there, including the redefinition finding as a real, worth-mentioning design decision.

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`:
- Add `GET /api/steam-moves (sustained same-direction tick-sequence detection)` to the API Endpoints list, right after `GET /api/market-maker/confirmations`.
- Update the automated-test-count line to the real number measured in Step 1.

In `PROJECT_STATE.md`:
- Add a new dated entry describing this feature (spec/plan file paths, the redefinition, the detection rule).
- Update the "19 backend routes total" count to 20 and add `/api/steam-moves` to the route list.
- Update the test file list/count to match Step 1's real number, including `logic/steamDetection.test.ts` in the file list.
- Update the handoff status block per the standing update-cadence instruction: mark #5 done, move to #6.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document steam move detection across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the entire branch's diff (all 4 tasks' commits together) before merging to `main` — do not merge without it.
