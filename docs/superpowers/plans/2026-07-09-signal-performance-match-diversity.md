# Signal Performance Match-Diversity Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `distinctMatchCount` and `largestMatchSharePct` to `GET /api/signal-performance`'s per-signal-type response, making the concentration problem found during investigation visible from the API itself going forward.

**Architecture:** Extends `summarizeSignalTypePerformance` (already grouped by signal type and already-settled) with a match-diversity computation over the same data, correctly collapsing totals sub-markets to their base fixture ID before counting.

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-09-signal-performance-match-diversity-design.md`

## Global Constraints

- Totals sub-market matchIds (`<fixtureId>-totals-<line>`) must collapse to their base fixture ID before counting distinct matches — otherwise concentration is understated exactly as found during the SHARP_MOVE investigation.
- No change to existing `settledCount`/`correctCount`/`incorrectCount`/`accuracyPct` computation or values.
- No dashboard change — `SignalPerformancePanel.tsx` is not touched.
- No new archive query — computed from the same already-fetched, already-grouped data.
- Test runner: Vitest, run from `apps/api/` via `npm run test`.
- This repo's docs must reflect this feature once merged.

---

### Task 1: `distinctMatchCount` and `largestMatchSharePct`

**Files:**
- Modify: `apps/api/src/logic/signalPerformance.ts`
- Modify: `apps/api/src/logic/signalPerformance.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SignalTypePerformance` gains `distinctMatchCount: number` and `largestMatchSharePct: number` — consumed by Task 2 (openapi.yaml documentation).

- [ ] **Step 1: Update the existing tests' expected objects**

In `apps/api/src/logic/signalPerformance.test.ts`, find:

```typescript
    expect(result).toEqual([
      {
        signalType: "SHARP_MOVE",
        settledCount: 3,
        correctCount: 2,
        incorrectCount: 1,
        accuracyPct: 67,
      },
    ]);
  });
```

Replace with:

```typescript
    expect(result).toEqual([
      {
        signalType: "SHARP_MOVE",
        settledCount: 3,
        correctCount: 2,
        incorrectCount: 1,
        accuracyPct: 67,
        distinctMatchCount: 1,
        largestMatchSharePct: 100,
      },
    ]);
  });
```

Then find:

```typescript
    expect(result).toEqual([
      { signalType: "SHARP_MOVE", settledCount: 1, correctCount: 1, incorrectCount: 0, accuracyPct: 100 },
      { signalType: "MOMENTUM_SHIFT", settledCount: 2, correctCount: 1, incorrectCount: 1, accuracyPct: 50 },
    ]);
  });

  it("excludes pending entries from settledCount", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "SHARP_MOVE", resultStatus: "pending" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result).toEqual([
      { signalType: "SHARP_MOVE", settledCount: 1, correctCount: 1, incorrectCount: 0, accuracyPct: 100 },
    ]);
  });
});
```

Replace with:

```typescript
    expect(result).toEqual([
      {
        signalType: "SHARP_MOVE",
        settledCount: 1,
        correctCount: 1,
        incorrectCount: 0,
        accuracyPct: 100,
        distinctMatchCount: 1,
        largestMatchSharePct: 100,
      },
      {
        signalType: "MOMENTUM_SHIFT",
        settledCount: 2,
        correctCount: 1,
        incorrectCount: 1,
        accuracyPct: 50,
        distinctMatchCount: 1,
        largestMatchSharePct: 100,
      },
    ]);
  });

  it("excludes pending entries from settledCount", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "SHARP_MOVE", resultStatus: "pending" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result).toEqual([
      {
        signalType: "SHARP_MOVE",
        settledCount: 1,
        correctCount: 1,
        incorrectCount: 0,
        accuracyPct: 100,
        distinctMatchCount: 1,
        largestMatchSharePct: 100,
      },
    ]);
  });

  it("reports distinctMatchCount and largestMatchSharePct across two evenly-split matches", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", matchId: "match-1", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "SHARP_MOVE", matchId: "match-2", resultStatus: "incorrect" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result[0].distinctMatchCount).toBe(2);
    expect(result[0].largestMatchSharePct).toBe(50);
  });

  it("collapses totals sub-markets of the same fixture into one match for diversity counting", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", matchId: "18202783", resultStatus: "correct" }),
      makeEntry({
        signalId: "s1",
        signalType: "SHARP_MOVE",
        matchId: "18202783-totals-0.75",
        resultStatus: "incorrect",
      }),
      makeEntry({
        signalId: "s2",
        signalType: "SHARP_MOVE",
        matchId: "18202783-totals-1.5",
        resultStatus: "incorrect",
      }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result[0].distinctMatchCount).toBe(1);
    expect(result[0].largestMatchSharePct).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/signalPerformance.test.ts
```

Expected: FAIL — `distinctMatchCount`/`largestMatchSharePct` are
`undefined` on the returned objects, and the two new tests reference
fields that don't exist yet.

- [ ] **Step 3: Write the implementation**

In `apps/api/src/logic/signalPerformance.ts`, find:

```typescript
export interface SignalTypePerformance {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
}
```

Replace with:

```typescript
export interface SignalTypePerformance {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
  distinctMatchCount: number;
  largestMatchSharePct: number;
}

/**
 * A totals signal's matchId is `<fixtureId>-totals-<line>` (see
 * isTotalsMatchId in archive.ts) - six different total-goals lines for
 * the same real match would otherwise count as six "distinct matches,"
 * understating concentration exactly as found during the SHARP_MOVE
 * accuracy investigation (2026-07-09).
 */
function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}
```

Then find:

```typescript
  return Array.from(bySignalType.entries()).map(([signalType, group]) => {
    const correctCount = group.filter((entry) => entry.resultStatus === "correct").length;
    const incorrectCount = group.length - correctCount;

    return {
      signalType,
      settledCount: group.length,
      correctCount,
      incorrectCount,
      accuracyPct: Math.round((correctCount / group.length) * 100),
    };
  });
```

Replace with:

```typescript
  return Array.from(bySignalType.entries()).map(([signalType, group]) => {
    const correctCount = group.filter((entry) => entry.resultStatus === "correct").length;
    const incorrectCount = group.length - correctCount;

    const matchCounts = new Map<string, number>();
    for (const entry of group) {
      const base = baseMatchId(entry.matchId);
      matchCounts.set(base, (matchCounts.get(base) ?? 0) + 1);
    }

    const largestMatchCount = Math.max(...matchCounts.values());

    return {
      signalType,
      settledCount: group.length,
      correctCount,
      incorrectCount,
      accuracyPct: Math.round((correctCount / group.length) * 100),
      distinctMatchCount: matchCounts.size,
      largestMatchSharePct: Math.round((largestMatchCount / group.length) * 100),
    };
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/signalPerformance.test.ts
```

Expected: PASS, all 6 tests green (4 existing, updated, plus 2 new).

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/logic/signalPerformance.ts apps/api/src/logic/signalPerformance.test.ts
git commit -m "Add match-diversity metrics to signal-type performance"
```

---

### Task 2: Document and verify

**Files:**
- Modify: `openapi.yaml`, `PROJECT_STATE.md`, `TECHNICAL_DOCS.md`

**Interfaces:**
- Consumes: Task 1 (documents actual behavior; no code dependency).
- Produces: nothing further — this is the last task in the plan.

- [ ] **Step 1: Update `openapi.yaml`**

Find:

```yaml
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        signalType: { type: string }
                        settledCount: { type: number }
                        correctCount: { type: number }
                        incorrectCount: { type: number }
                        accuracyPct: { type: number }
                      required: [signalType, settledCount, correctCount, incorrectCount, accuracyPct]
```

Replace with:

```yaml
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        signalType: { type: string }
                        settledCount: { type: number }
                        correctCount: { type: number }
                        incorrectCount: { type: number }
                        accuracyPct: { type: number }
                        distinctMatchCount:
                          type: number
                          description: >
                            How many distinct real matches this signal
                            type's settled entries span (totals sub-markets
                            of the same fixture collapse to one match).
                        largestMatchSharePct:
                          type: number
                          description: >
                            What percentage of this signal type's settled
                            entries come from its single most-represented
                            match - a high value means the accuracyPct above
                            is not yet diversified, statistically meaningful
                            evidence.
                      required: [signalType, settledCount, correctCount, incorrectCount, accuracyPct, distinctMatchCount, largestMatchSharePct]
```

- [ ] **Step 2: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same
pre-existing cosmetic warnings as before.

- [ ] **Step 3: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 4: Update the docs**

In `TECHNICAL_DOCS.md`'s "Composite Confidence Score and Signal-Type
Performance" section, add a sentence describing the two new fields and
why they exist (the concentration finding). Reference
`docs/superpowers/specs/2026-07-09-signal-performance-match-diversity-design.md`.

In `PROJECT_STATE.md`: add a brief dated entry (continuing the numbered
feature list from item 14) describing this strengthening and linking it
to the "Open questions" entry it directly addresses. Update the handoff
status block.

- [ ] **Step 5: Commit**

```bash
git add openapi.yaml PROJECT_STATE.md TECHNICAL_DOCS.md
git commit -m "Document signal-performance match-diversity metrics"
```

- [ ] **Step 6: Request final whole-branch review**

Per this repo's established convention, request a final review of the
entire branch's diff (both tasks' commits together) before merging to
`main` — do not merge without it.
