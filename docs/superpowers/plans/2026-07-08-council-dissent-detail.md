# Outcome Audit Dissenting-Vote Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make council disagreement on `GET /api/replay/backtest` a queryable data point — per-signal `unanimous`/`dissentingAgents` fields, plus an aggregate `summary.councilDissent` object — instead of something only reconstructable by reading three raw vote objects per signal.

**Architecture:** A new pure module, `logic/councilDissent.ts`, computes dissent per signal and summarizes it across a run. `server.ts`'s existing `/api/replay/backtest` route (which already builds `councilVotes[]` and `summary` inline) calls these two functions and merges their output into the existing response shape. No other route logic changes.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-council-dissent-detail-design.md`

## Global Constraints

- Backend-only — no changes to `apps/web/src/App.tsx` (explicitly deferred per the spec's "Problem" section).
- Dissent is defined as: any agent whose vote is not `"approve"`. `unanimous` is true only when `approvals === 3`.
- `dissentByAgent` must include every agent name at `0` if they never dissented, built generically from whichever agent names appear in the votes (not hardcoded to the three current agent names).
- `dissentRatePct` is `Math.round((dissentingSignals / totalSignals) * 100)`, `0` when there are no signals — matching the existing `accuracyPct` pattern in the same `summary` object.
- The existing `votes`/`decision`/`approvals`/`totalAgents` construction in `server.ts` is untouched — this plan only adds fields.
- The proof hash's `councilVotes` mapping gains `unanimous`/`dissentingAgents`; the full `votes` array (with free-text reasons) stays excluded from the hash input, matching existing precedent.
- Test runner: Vitest, run from `apps/api/` via `npm run test` (or `npx vitest run <path>` for a single file).
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged — established convention this session.

---

### Task 1: `computeDissent` / `summarizeDissent` in `logic/councilDissent.ts`

**Files:**
- Create: `apps/api/src/logic/councilDissent.ts`
- Create: `apps/api/src/logic/councilDissent.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions, no dependencies on other code).
- Produces: `CouncilVoteEntry` type, `DissentInfo` type, `DissentSummary` type, `computeDissent(votes: CouncilVoteEntry[]): DissentInfo`, `summarizeDissent(perSignalVotes: CouncilVoteEntry[][]): DissentSummary` — all four consumed by Task 2 (`server.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/logic/councilDissent.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeDissent, summarizeDissent } from "./councilDissent";
import type { CouncilVoteEntry } from "./councilDissent";

function makeVotes(overrides: Partial<Record<"a" | "b" | "c", CouncilVoteEntry["vote"]>> = {}): CouncilVoteEntry[] {
  return [
    { agent: "Agent A - Movement Detector", vote: overrides.a ?? "approve", reason: "reason A" },
    { agent: "Agent B - Mean Reversion Guard", vote: overrides.b ?? "approve", reason: "reason B" },
    { agent: "Agent C - Evidence Correlator", vote: overrides.c ?? "approve", reason: "reason C" },
  ];
}

describe("computeDissent", () => {
  it("is unanimous when all three agents approve", () => {
    expect(computeDissent(makeVotes())).toEqual({ unanimous: true, dissentingAgents: [] });
  });

  it("lists the one dissenting agent when two of three approve", () => {
    expect(computeDissent(makeVotes({ b: "watch" }))).toEqual({
      unanimous: false,
      dissentingAgents: ["Agent B - Mean Reversion Guard"],
    });
  });

  it("lists both dissenting agents in the 1-of-3 watch case", () => {
    expect(computeDissent(makeVotes({ b: "watch", c: "watch" }))).toEqual({
      unanimous: false,
      dissentingAgents: ["Agent B - Mean Reversion Guard", "Agent C - Evidence Correlator"],
    });
  });

  it("lists Agent A when it rejects even if B and C approve", () => {
    expect(computeDissent(makeVotes({ a: "reject" }))).toEqual({
      unanimous: false,
      dissentingAgents: ["Agent A - Movement Detector"],
    });
  });
});

describe("summarizeDissent", () => {
  it("returns zero counts and an empty dissentByAgent for an empty run", () => {
    expect(summarizeDissent([])).toEqual({
      unanimousSignals: 0,
      dissentingSignals: 0,
      dissentRatePct: 0,
      dissentByAgent: {},
    });
  });

  it("counts unanimous vs dissenting signals across a run", () => {
    const perSignalVotes = [
      makeVotes(),
      makeVotes({ b: "watch" }),
      makeVotes({ b: "watch", c: "watch" }),
      makeVotes(),
    ];

    const summary = summarizeDissent(perSignalVotes);

    expect(summary.unanimousSignals).toBe(2);
    expect(summary.dissentingSignals).toBe(2);
    expect(summary.dissentRatePct).toBe(50);
  });

  it("includes an agent at 0 in dissentByAgent if it never dissents", () => {
    const perSignalVotes = [makeVotes({ b: "watch" }), makeVotes({ b: "watch" })];

    const summary = summarizeDissent(perSignalVotes);

    expect(summary.dissentByAgent).toEqual({
      "Agent A - Movement Detector": 0,
      "Agent B - Mean Reversion Guard": 2,
      "Agent C - Evidence Correlator": 0,
    });
  });

  it("rounds dissentRatePct and handles a run where every signal dissents", () => {
    const perSignalVotes = [makeVotes({ a: "reject" }), makeVotes({ a: "reject" }), makeVotes()];

    const summary = summarizeDissent(perSignalVotes);

    expect(summary.unanimousSignals).toBe(1);
    expect(summary.dissentingSignals).toBe(2);
    expect(summary.dissentRatePct).toBe(67);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/councilDissent.test.ts
```

Expected: FAIL — `Cannot find module './councilDissent'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/logic/councilDissent.ts`:

```typescript
export interface CouncilVoteEntry {
  agent: string;
  vote: "approve" | "reject" | "watch";
  reason: string;
}

export interface DissentInfo {
  unanimous: boolean;
  dissentingAgents: string[];
}

/**
 * Only Agent A can literally vote "reject"; Agent B and C only ever vote
 * "approve" or "watch" - a true 3-way unanimous "no" is impossible in this
 * schema, so the only symmetric consensus state is all three approving.
 * Dissent is therefore defined as any vote that isn't "approve".
 */
export function computeDissent(votes: CouncilVoteEntry[]): DissentInfo {
  const dissentingAgents = votes
    .filter((vote) => vote.vote !== "approve")
    .map((vote) => vote.agent);

  return { unanimous: dissentingAgents.length === 0, dissentingAgents };
}

export interface DissentSummary {
  unanimousSignals: number;
  dissentingSignals: number;
  dissentRatePct: number;
  dissentByAgent: Record<string, number>;
}

/**
 * dissentByAgent is seeded with every agent name that appears anywhere in
 * the run at 0 first, so an agent who never dissents still appears in the
 * map rather than being silently omitted.
 */
export function summarizeDissent(perSignalVotes: CouncilVoteEntry[][]): DissentSummary {
  const dissentByAgent: Record<string, number> = {};

  for (const votes of perSignalVotes) {
    for (const vote of votes) {
      dissentByAgent[vote.agent] = dissentByAgent[vote.agent] ?? 0;
    }
  }

  let unanimousSignals = 0;

  for (const votes of perSignalVotes) {
    const { unanimous, dissentingAgents } = computeDissent(votes);
    if (unanimous) unanimousSignals += 1;
    for (const agent of dissentingAgents) {
      dissentByAgent[agent] += 1;
    }
  }

  const dissentingSignals = perSignalVotes.length - unanimousSignals;
  const dissentRatePct =
    perSignalVotes.length > 0
      ? Math.round((dissentingSignals / perSignalVotes.length) * 100)
      : 0;

  return { unanimousSignals, dissentingSignals, dissentRatePct, dissentByAgent };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/councilDissent.test.ts
```

Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/logic/councilDissent.ts apps/api/src/logic/councilDissent.test.ts
git commit -m "Add pure dissent computation for the Outcome Audit council"
```

---

### Task 2: Wire dissent detail into `GET /api/replay/backtest`

**Files:**
- Modify: `apps/api/src/server.ts:14` (imports)
- Modify: `apps/api/src/server.ts:712-764` (`councilVotes` construction)
- Modify: `apps/api/src/server.ts:813-818` (proof hash's `councilVotes` mapping)
- Modify: `apps/api/src/server.ts:828-840` (`summary` object)

**Interfaces:**
- Consumes: `computeDissent`, `summarizeDissent`, `CouncilVoteEntry` (Task 1, `./logic/councilDissent`).
- Produces: the live enriched `GET /api/replay/backtest` response, consumed by Task 3 (openapi.yaml docs) and Task 4 (final verification).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, add this import line right after the existing `import { computeArenaScoreboards, isTotalsSignal } from "./logic/arena";` line:

```typescript
import { computeDissent, summarizeDissent } from "./logic/councilDissent";
```

- [ ] **Step 2: Add `unanimous`/`dissentingAgents` to each `councilVotes` entry**

In `apps/api/src/server.ts`, find this exact block (the end of the `councilVotes` construction):

```typescript
    const approvals = votes.filter((vote) => vote.vote === "approve").length;
    const decision =
      approvals >= 2 ? "approved" : approvals === 1 ? "watch" : "rejected";

    return {
      signalId: signal.id,
      matchId: signal.matchId,
      target: signal.target,
      decision,
      approvals,
      totalAgents: votes.length,
      votes,
    };
  });
```

Replace it with:

```typescript
    const approvals = votes.filter((vote) => vote.vote === "approve").length;
    const decision =
      approvals >= 2 ? "approved" : approvals === 1 ? "watch" : "rejected";
    const dissent = computeDissent(votes);

    return {
      signalId: signal.id,
      matchId: signal.matchId,
      target: signal.target,
      decision,
      approvals,
      totalAgents: votes.length,
      votes,
      unanimous: dissent.unanimous,
      dissentingAgents: dissent.dissentingAgents,
    };
  });

  const councilDissentSummary = summarizeDissent(councilVotes.map((vote) => vote.votes));
```

- [ ] **Step 3: Add the new fields to the proof hash's `councilVotes` mapping**

Find this exact block:

```typescript
        councilVotes: councilVotes.map((councilVote) => ({
          signalId: councilVote.signalId,
          decision: councilVote.decision,
          approvals: councilVote.approvals,
          totalAgents: councilVote.totalAgents,
        })),
```

Replace it with:

```typescript
        councilVotes: councilVotes.map((councilVote) => ({
          signalId: councilVote.signalId,
          decision: councilVote.decision,
          approvals: councilVote.approvals,
          totalAgents: councilVote.totalAgents,
          unanimous: councilVote.unanimous,
          dissentingAgents: councilVote.dissentingAgents,
        })),
```

- [ ] **Step 4: Add `councilDissent` to the `summary` object**

Find this exact block:

```typescript
      summary: {
        snapshotsProcessed: replaySnapshots.length,
        signalsDetected: detectedSignals.length,
        correctSignals,
        incorrectSignals,
        accuracyPct:
          settledSignalCount > 0
            ? Math.round((correctSignals / settledSignalCount) * 100)
            : 0,
        smartMoneyTraps,
```

Replace it with:

```typescript
      summary: {
        snapshotsProcessed: replaySnapshots.length,
        signalsDetected: detectedSignals.length,
        correctSignals,
        incorrectSignals,
        accuracyPct:
          settledSignalCount > 0
            ? Math.round((correctSignals / settledSignalCount) * 100)
            : 0,
        smartMoneyTraps,
        councilDissent: councilDissentSummary,
```

(The block continues unchanged after `smartMoneyTraps,` with `confirmedTraps,` and `possibleTraps,` — only the new `councilDissent` line is inserted.)

- [ ] **Step 5: Verify the project builds**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no type errors.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass, total test count higher than the pre-existing 87.

- [ ] **Step 7: Manual verification against a running server**

Start the dev server (`cd apps/api && npm run dev`), then in another terminal:

```bash
curl -s "http://localhost:4000/api/replay/backtest" | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks).toString());
  console.log('councilDissent:', JSON.stringify(body.data.summary.councilDissent, null, 2));
  console.log('first councilVotes entry unanimous/dissentingAgents:', {
    unanimous: body.data.councilVotes[0]?.unanimous,
    dissentingAgents: body.data.councilVotes[0]?.dissentingAgents,
  });
});
"
```

Expected: `councilDissent` prints an object with `unanimousSignals`, `dissentingSignals`, `dissentRatePct`, and `dissentByAgent` (all three agent names present, none missing); the first `councilVotes` entry prints a boolean `unanimous` and an array `dissentingAgents` consistent with its own `approvals` count (e.g. `approvals: 2` implies exactly one name in `dissentingAgents`).

Stop the dev server afterward (find its PID via `netstat -ano | grep ":4000.*LISTENING"` on Windows and kill that exact PID — do not use a broad `pkill` pattern, since other unrelated dev servers may be running on this machine).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Expose council dissent detail on GET /api/replay/backtest"
```

---

### Task 3: Document the new fields in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml:280-301` (`CouncilVote`/`CouncilDecision` schemas)
- Modify: `openapi.yaml:316-327` (`ReplaySummary` schema)

**Interfaces:**
- Consumes: the response shape from Task 2 (documents actual behavior; no code dependency).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add `unanimous`/`dissentingAgents` to `CouncilDecision`**

Find this exact block:

```yaml
    CouncilDecision:
      type: object
      properties:
        signalId: { type: string }
        matchId: { type: string }
        target: { type: string }
        decision: { type: string, enum: [approved, watch, rejected] }
        approvals: { type: number }
        totalAgents: { type: number }
        votes:
          type: array
          items:
            $ref: '#/components/schemas/CouncilVote'
      required: [signalId, matchId, target, decision, approvals, totalAgents, votes]
```

Replace it with:

```yaml
    CouncilDecision:
      type: object
      properties:
        signalId: { type: string }
        matchId: { type: string }
        target: { type: string }
        decision: { type: string, enum: [approved, watch, rejected] }
        approvals: { type: number }
        totalAgents: { type: number }
        votes:
          type: array
          items:
            $ref: '#/components/schemas/CouncilVote'
        unanimous:
          type: boolean
          description: True only when all agents voted "approve" (3 of 3) - the only symmetric consensus state possible, since only Agent A can literally vote "reject".
        dissentingAgents:
          type: array
          items: { type: string }
          description: Names of agents whose vote was not "approve" for this signal.
      required: [signalId, matchId, target, decision, approvals, totalAgents, votes, unanimous, dissentingAgents]
```

- [ ] **Step 2: Add a `CouncilDissentSummary` schema**

Find this exact block:

```yaml
    ReplaySummary:
      type: object
      properties:
        snapshotsProcessed: { type: number }
        signalsDetected: { type: number }
        correctSignals: { type: number }
        incorrectSignals: { type: number }
        accuracyPct: { type: number }
        smartMoneyTraps: { type: number }
        confirmedTraps: { type: number }
        possibleTraps: { type: number }
      required: [snapshotsProcessed, signalsDetected, correctSignals, incorrectSignals, accuracyPct, smartMoneyTraps, confirmedTraps, possibleTraps]
```

Replace it with:

```yaml
    CouncilDissentSummary:
      type: object
      properties:
        unanimousSignals: { type: number }
        dissentingSignals: { type: number }
        dissentRatePct: { type: number }
        dissentByAgent:
          type: object
          additionalProperties: { type: number }
          description: Every agent name observed in the run, mapped to how many signals it dissented on. Agents that never dissent still appear, at 0.
      required: [unanimousSignals, dissentingSignals, dissentRatePct, dissentByAgent]

    ReplaySummary:
      type: object
      properties:
        snapshotsProcessed: { type: number }
        signalsDetected: { type: number }
        correctSignals: { type: number }
        incorrectSignals: { type: number }
        accuracyPct: { type: number }
        smartMoneyTraps: { type: number }
        confirmedTraps: { type: number }
        possibleTraps: { type: number }
        councilDissent:
          $ref: '#/components/schemas/CouncilDissentSummary'
      required: [snapshotsProcessed, signalsDetected, correctSignals, incorrectSignals, accuracyPct, smartMoneyTraps, confirmedTraps, possibleTraps, councilDissent]
```

- [ ] **Step 3: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same pre-existing cosmetic `operationId` warnings as before (no new errors).

- [ ] **Step 4: Commit**

```bash
git add openapi.yaml
git commit -m "Document council dissent detail in openapi.yaml"
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

Expected: all test files pass. Note the exact new total test count (was 87 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`'s "Outcome Audit Layer (Council Vote, Trap Detection, Proof Hash)" section, add a sentence describing the dissent detail: each `councilVotes[]` entry now includes `unanimous`/`dissentingAgents`, and `summary.councilDissent` reports `unanimousSignals`/`dissentingSignals`/`dissentRatePct`/`dissentByAgent` across the run — making agent disagreement itself queryable rather than only reconstructable from the raw per-signal `votes` array.

In `SUBMISSION_NOTES.md`'s "Outcome Audit Layer" section, add the same fact in the narrative style already used there (see the existing "Three-Agent Council Vote" bullet).

In `README.md`, no route-list change is needed (`GET /api/replay/backtest` is already listed and its behavior, not its route, changed) — skip unless the automated test count needs updating there too (see below).

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`: update the automated-test-count line to the real number measured in Step 1.

In `PROJECT_STATE.md`:
- Add a new dated entry under "This session" (or a new session-dated section, matching whatever section already exists for 2026-07-08 work) describing this feature: dissent detail added to `GET /api/replay/backtest`, backend-only, spec/plan file paths.
- Update the test file list/count to match Step 1's real number, including `logic/councilDissent.test.ts` in the file list.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document Outcome Audit dissent detail across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the entire branch's diff (all 4 tasks' commits together) before merging to `main` — do not merge without it.
