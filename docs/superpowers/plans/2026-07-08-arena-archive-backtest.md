# Retroactive Arena Backtesting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/arena/backtest`, replaying Momentum Follower and Kelly Criterion against the full archived signal history (not just the capped-100 in-memory `store.signals`), reusing the existing Arena builder functions with zero duplicated logic.

**Architecture:** A new pure orchestration function, `computeBacktestScoreboards`, maps archived `AgentSignal` objects through `arena.ts`'s existing `buildMomentumFollowerPosition`/`buildKellyCriterionPosition`/`summarize` (the last newly exported). A new route reads the archive the same bounded way `GET /api/signal-performance` already does and feeds the result through it. Contrarian is excluded — confirmed with the user — since the archive never captures the match's final score needed to resolve its opposing-side outcome.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-arena-archive-backtest-design.md`

## Global Constraints

- Only Momentum Follower and Kelly Criterion are backtested. Contrarian is explicitly excluded, with the reason surfaced in the response `note` field, not silently dropped.
- No archive schema change — both backtested agents need only fields already present on the archived `AgentSignal` (`side`, `target`, `oddsAfter`, `resultStatus`, `confidenceScore`).
- Route name is `GET /api/arena/backtest`, not `GET /api/backtest` — deliberately distinct from the pre-existing, unrelated `GET /api/replay/backtest` (single-signal council-vote replay).
- Single bounded archive fetch: `getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 })` — same precedent as `GET /api/signal-performance`, no pagination loop.
- No new tests for `buildMomentumFollowerPosition`/`buildKellyCriterionPosition` themselves — this feature only orchestrates already-tested functions against a different signal source.
- No dashboard panel — backend-only.
- Test runner: Vitest, run from `apps/api/` via `npm run test`.
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged.

---

### Task 1: `computeBacktestScoreboards` in `logic/backtest.ts`

**Files:**
- Modify: `apps/api/src/logic/arena.ts` (export `summarize`)
- Create: `apps/api/src/logic/backtest.ts`
- Create: `apps/api/src/logic/backtest.test.ts`

**Interfaces:**
- Consumes: `buildMomentumFollowerPosition(signal): ArenaPosition | null`, `buildKellyCriterionPosition(signal): ArenaPosition | null`, `summarize(agentId, label, positions): ArenaScoreboard` (all existing, `./arena`, `summarize` newly exported this task).
- Produces: `computeBacktestScoreboards(archivedSignals: AgentSignal[]): { momentumFollower: ArenaScoreboard; kellyCriterion: ArenaScoreboard }` — consumed by Task 2 (`server.ts`).

- [ ] **Step 1: Export `summarize` from `arena.ts`**

In `apps/api/src/logic/arena.ts`, find:

```typescript
function summarize(
  agentId: ArenaAgentId,
  label: string,
  positions: ArenaPosition[]
): ArenaScoreboard {
```

Replace with:

```typescript
export function summarize(
  agentId: ArenaAgentId,
  label: string,
  positions: ArenaPosition[]
): ArenaScoreboard {
```

- [ ] **Step 2: Verify the existing Arena tests still pass (no behavior change, only visibility)**

```bash
cd apps/api && npx vitest run src/logic/arena.test.ts
```

Expected: PASS, all 29 existing tests green (exporting a function doesn't change its behavior).

- [ ] **Step 3: Write the failing tests**

Create `apps/api/src/logic/backtest.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeBacktestScoreboards } from "./backtest";
import type { AgentSignal } from "../types";

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
    oddsAfter: 2.0,
    oddsChangePct: 25,
    momentumScore: 50,
    explanation: "test signal",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

describe("computeBacktestScoreboards", () => {
  it("returns empty scoreboards for no archived signals", () => {
    const { momentumFollower, kellyCriterion } = computeBacktestScoreboards([]);

    expect(momentumFollower.settledCount).toBe(0);
    expect(kellyCriterion.settledCount).toBe(0);
  });

  it("aggregates Momentum Follower and Kelly Criterion across archived signals, excluding totals", () => {
    const signals: AgentSignal[] = [
      makeSignal({
        id: "signal-1",
        resultStatus: "correct",
        oddsAfter: 2.0,
        confidenceScore: 100,
      }),
      makeSignal({
        id: "signal-2",
        resultStatus: "incorrect",
        oddsAfter: 1.5,
        confidenceScore: 20,
      }),
      makeSignal({
        id: "signal-3",
        target: "Over 3.5",
        resultStatus: "correct",
        oddsAfter: 2.0,
        confidenceScore: 100,
      }),
    ];

    const { momentumFollower, kellyCriterion } = computeBacktestScoreboards(signals);

    // Momentum Follower (flat 1-unit stakes): (2.0-1) + (-1) = 0 net units
    // over 2 settled bets (totals signal-3 excluded) -> 0% ROI, 50% win rate.
    expect(momentumFollower.settledCount).toBe(2);
    expect(momentumFollower.netUnits).toBe(0);
    expect(momentumFollower.roiPercent).toBe(0);
    expect(momentumFollower.winRatePct).toBe(50);

    // Kelly Criterion: signal-1 (odds=2.0, confidence=100) stakes 2.0,
    // wins 2.0. signal-2 (odds=1.5, confidence=20) stakes 0.9, loses 0.9.
    // netUnits = 2.0 + (-0.9) = 1.1; totalStaked = 2.0 + 0.9 = 2.9;
    // roiPercent = round((1.1 / 2.9) * 100) = 37.93.
    expect(kellyCriterion.settledCount).toBe(2);
    expect(kellyCriterion.positions[0].stakeUnits).toBe(2.0);
    expect(kellyCriterion.positions[1].stakeUnits).toBe(0.9);
    expect(kellyCriterion.netUnits).toBe(1.1);
    expect(kellyCriterion.roiPercent).toBe(37.93);
    expect(kellyCriterion.winRatePct).toBe(50);
  });

  it("treats a missing confidenceScore as zero edge without crashing Kelly's backtest", () => {
    const signals: AgentSignal[] = [
      makeSignal({ confidenceScore: undefined, resultStatus: "pending" }),
    ];

    const { kellyCriterion } = computeBacktestScoreboards(signals);

    expect(kellyCriterion.positions[0].stakeUnits).toBe(0);
    expect(kellyCriterion.positions[0].profitUnits).toBe(0);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/backtest.test.ts
```

Expected: FAIL — `Cannot find module './backtest'` (the file doesn't exist yet).

- [ ] **Step 5: Write the implementation**

Create `apps/api/src/logic/backtest.ts`:

```typescript
import { AgentSignal, ArenaScoreboard } from "../types";
import {
  buildKellyCriterionPosition,
  buildMomentumFollowerPosition,
  summarize,
} from "./arena";

/**
 * Replays Momentum Follower and Kelly Criterion against archived signals
 * (not the live, capped-100 store.signals) - both only need fields
 * already present on the archived AgentSignal itself, so this is a pure
 * remapping of arena.ts's own builder functions, not new agent logic.
 * Contrarian is not backtestable: it needs the real match final score to
 * resolve the opposing side's outcome, which the archive never captures.
 */
export function computeBacktestScoreboards(
  archivedSignals: AgentSignal[]
): { momentumFollower: ArenaScoreboard; kellyCriterion: ArenaScoreboard } {
  const momentumPositions = archivedSignals
    .map(buildMomentumFollowerPosition)
    .filter((position): position is NonNullable<typeof position> => position !== null);

  const kellyPositions = archivedSignals
    .map(buildKellyCriterionPosition)
    .filter((position): position is NonNullable<typeof position> => position !== null);

  return {
    momentumFollower: summarize("momentum_follower", "Momentum Follower", momentumPositions),
    kellyCriterion: summarize("kelly_criterion", "Kelly Criterion", kellyPositions),
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/backtest.test.ts
```

Expected: PASS, all 3 tests green.

- [ ] **Step 7: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/logic/arena.ts apps/api/src/logic/backtest.ts apps/api/src/logic/backtest.test.ts
git commit -m "Add pure backtest orchestration reusing Arena's Momentum Follower and Kelly builders"
```

---

### Task 2: Register `GET /api/arena/backtest` in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `computeBacktestScoreboards` (Task 1, `./logic/backtest`); `getArchivedSignals` (existing, `./services/archive`, already imported).
- Produces: the live `GET /api/arena/backtest` route, consumed by Task 3 (openapi.yaml documentation).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, add this import line right after the existing `import { summarizeSignalTypePerformance } from "./logic/signalPerformance";` line:

```typescript
import { computeBacktestScoreboards } from "./logic/backtest";
```

- [ ] **Step 2: Add the route**

Find this exact block in `apps/api/src/server.ts` (the `GET /api/signal-performance` route):

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

app.get("/api/arena/backtest", async (_req, res) => {
  const result = await getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 });
  const archivedSignals = result.data.map((entry) => entry.signalData);
  const { momentumFollower, kellyCriterion } = computeBacktestScoreboards(archivedSignals);

  res.json({
    data: { momentumFollower, kellyCriterion },
    summary: {
      archivedSignalsScanned: result.data.length,
    },
    note:
      "Contrarian is excluded from backtesting: the archive stores each signal's own resultStatus but not the match's final score, so Contrarian's opposing-side outcome (win vs. draw) can't be reconstructed from archived data alone.",
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

Expected: all test files pass, total test count higher than the pre-existing 158.

- [ ] **Step 5: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`, checking port availability first via `netstat -ano | grep ":4000.*LISTENING"` and preferring an alternate port like `PORT=4090 npm run dev` if occupied by something not yours), then in another terminal:

```bash
curl -s "http://localhost:4090/api/arena/backtest" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log(JSON.stringify(body, null, 2));
});
"
```

Expected: since this dev environment has no live Supabase credentials, `getArchivedSignals` fails open — expect `momentumFollower.settledCount: 0`, `kellyCriterion.settledCount: 0`, `summary.archivedSignalsScanned: 0`, and the `note` field present, not an error. This matches the existing `GET /api/signal-performance` endpoint's own documented fail-open behavior in the same environment. Stop the dev server afterward by finding its PID (`netstat -ano | grep ":4090.*LISTENING"`), confirming its command line via `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'`, then stopping that exact PID.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Register GET /api/arena/backtest route"
```

---

### Task 3: Document `GET /api/arena/backtest` in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: the route from Task 2 (documents actual behavior; no code dependency).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the path**

Find this exact block (the end of the `/api/signal-performance` path, right before `/api/onchain/validate-stat`):

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

  /api/onchain/validate-stat:
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

  /api/arena/backtest:
    get:
      summary: Retroactive Arena backtest against the full archived signal history
      description: >
        Replays Momentum Follower and Kelly Criterion against the 500 most
        recent settled entries in the insert-only signal archive, not just
        the live, capped-100 in-memory signal feed GET /api/arena reads
        from. Contrarian is excluded: the archive stores each signal's own
        resultStatus but not the match's final score, so its opposing-side
        outcome (win vs. draw) can't be reconstructed from archived data
        alone - see the response's note field. Fail-open: returns 200 with
        empty scoreboards if Supabase is unconfigured or unreachable,
        inherited from the existing GET /api/archive endpoint's own
        fail-open behavior.
      responses:
        '200':
          description: Backtested scoreboards for the two reconstructable agents.
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
                      kellyCriterion:
                        $ref: '#/components/schemas/ArenaScoreboard'
                    required: [momentumFollower, kellyCriterion]
                  summary:
                    type: object
                    properties:
                      archivedSignalsScanned: { type: number }
                    required: [archivedSignalsScanned]
                  note: { type: string }
                required: [data, summary, note]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/onchain/validate-stat:
```

- [ ] **Step 2: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same pre-existing cosmetic warnings as before, plus 1 (no new errors).

- [ ] **Step 3: Commit**

```bash
git add openapi.yaml
git commit -m "Document GET /api/arena/backtest in openapi.yaml"
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

Expected: all test files pass. Note the exact new total test count (was 158 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`, add a new section (after the Kelly Criterion addition to the "Agent vs Agent Arena" section) describing `GET /api/arena/backtest`: what it replays, why Contrarian is excluded (the same match-final-score gap explained in the spec), and the reused `summarize`/builder functions. Add `logic/backtest.ts` to the "Important backend files" list.

In `SUBMISSION_NOTES.md`, add a new numbered entry under "Major Features Added This Session" (continuing from "10. Arena Third Agent: Kelly Criterion") describing this feature, including the Contrarian-exclusion finding as a genuine architectural constraint worth mentioning (matching how prior entries there describe real findings).

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`:
- Add `GET /api/arena/backtest (retroactive Momentum Follower/Kelly Criterion backtest against the full archive)` to the API Endpoints list, right after the `GET /api/arena` entry.
- Update the automated-test-count line to the real number measured in Step 1.

In `PROJECT_STATE.md`:
- Add a new dated entry (numbered continuing from the existing 11 feature entries) describing this feature: the Contrarian-exclusion constraint, the reused `summarize`/builder functions, the route name distinction from `GET /api/replay/backtest`.
- Update the "22 backend routes total" count to 23 and add `/api/arena/backtest` to the route list.
- Update the test file list/count to match Step 1's real number, including `logic/backtest.test.ts` in the file list.
- Update the handoff status block per the standing update-cadence instruction: mark #9 done, move to #10.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document retroactive Arena backtesting across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the entire branch's diff (all 4 tasks' commits together) before merging to `main` — do not merge without it.
