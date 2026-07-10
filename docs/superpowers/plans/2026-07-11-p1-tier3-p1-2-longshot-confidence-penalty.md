# P1-2 Longshot Confidence Penalty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a data-derived longshot-odds penalty to `calculateConfidenceScore` so a signal's confidence honestly reflects the real accuracy cliff found at `oddsAfter >= 3` in archived data, instead of recalibrating the 4%/8%/15% severity thresholds (investigated and confirmed not to be the actual problem).

**Architecture:** One new parameter (`oddsAfter`) on `calculateConfidenceScore`, applied as a multiplicative penalty after its existing 3-component weighted composite (unchanged). One new parameter on `buildContextExplanation` to append a matching transparency sentence. Both call sites updated in `buildSignalFromSnapshots`. No change to severity, `signalType`, signal generation, or `arena.ts` — Kelly Criterion's stake-sizing benefit is automatic since it already reads `confidenceScore`.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- `LONGSHOT_ODDS_THRESHOLD = 3` and `LONGSHOT_CONFIDENCE_FACTOR = 0.3` are real, data-derived values (see spec) — do not adjust without new data to justify it.
- The code comment above these two constants must state the sample-size caveat explicitly (49 settled 1X2 signals, concentrated in 3 matches, ~4 tournament matches remain) — this is a specific user requirement, not optional.
- No change to severity/`signalType`/signal-generation logic, and no change to `arena.ts` at all.
- Verify backend with `npm run test && npm run build` from `apps/api` after the implementation task.

---

### Task 1: Longshot confidence penalty

**Files:**
- Modify: `apps/api/src/logic/signalEngine.ts`
- Modify: `apps/api/src/logic/signalEngine.test.ts`

**Interfaces:**
- `calculateConfidenceScore(changePct: number, scoresContext: TxLineScoresContext | undefined, freshnessTightness: number | null, oddsAfter: number): number` — new 4th parameter, existing 3-arg behavior for the first 3 params is byte-for-byte unchanged before the new penalty step.
- `buildContextExplanation(target: string, signalSide: TeamSide, oddsAfter: number, scoresContext?: TxLineScoresContext)` — `oddsAfter` inserted as the new 3rd parameter (before the existing optional `scoresContext`).

- [ ] **Step 1: Write the failing `calculateConfidenceScore` tests**

In `apps/api/src/logic/signalEngine.test.ts`, find:

```typescript
describe("calculateConfidenceScore", () => {
  it("falls back to the magnitude component alone when no scoresContext is present", () => {
    // 7.5% is half of the 15% magnitude reference, so magnitudeScore is 50;
    // with no scoresContext, weight renormalizes to the magnitude component
    // alone, so the result is exactly 50, not dragged down by two missing
    // components.
    expect(calculateConfidenceScore(7.5, undefined, null)).toBe(50);
  });

  it("clamps the magnitude component at 100 for a move beyond the 15% reference", () => {
    expect(calculateConfidenceScore(25, undefined, null)).toBe(100);
  });

  it("blends all three components with their configured weights", () => {
    // magnitude=15% -> 100, fieldPressureScore=0 -> 0, freshnessTightness=0.
    // Expected: 100*0.5 + 0*0.3 + 0*0.2 = 50.
    const scoresContext = { fieldPressureScore: 0 };
    expect(calculateConfidenceScore(15, scoresContext, 0)).toBe(50);
  });
});
```

Replace with:

```typescript
describe("calculateConfidenceScore", () => {
  it("falls back to the magnitude component alone when no scoresContext is present", () => {
    // 7.5% is half of the 15% magnitude reference, so magnitudeScore is 50;
    // with no scoresContext, weight renormalizes to the magnitude component
    // alone, so the result is exactly 50, not dragged down by two missing
    // components. oddsAfter=1.5 is below the longshot cliff, so the base
    // score is returned unpenalized.
    expect(calculateConfidenceScore(7.5, undefined, null, 1.5)).toBe(50);
  });

  it("clamps the magnitude component at 100 for a move beyond the 15% reference", () => {
    expect(calculateConfidenceScore(25, undefined, null, 1.5)).toBe(100);
  });

  it("blends all three components with their configured weights", () => {
    // magnitude=15% -> 100, fieldPressureScore=0 -> 0, freshnessTightness=0.
    // Expected: 100*0.5 + 0*0.3 + 0*0.2 = 50.
    const scoresContext = { fieldPressureScore: 0 };
    expect(calculateConfidenceScore(15, scoresContext, 0, 1.5)).toBe(50);
  });

  it("applies the longshot penalty when oddsAfter is at or above the 3.0 cliff", () => {
    // Same inputs as the "clamps the magnitude component at 100..." case
    // above (baseScore 100), but oddsAfter=3 meets the cliff: 100*0.3=30.
    expect(calculateConfidenceScore(25, undefined, null, 3)).toBe(30);
  });

  it("does not apply the longshot penalty just under the 3.0 cliff", () => {
    expect(calculateConfidenceScore(25, undefined, null, 2.99)).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run from `apps/api`: `npx vitest run src/logic/signalEngine.test.ts`
Expected: the 3 pre-existing tests still PASS (Vitest transforms via esbuild without type-checking, so the extra 4th argument is silently accepted but ignored by the not-yet-updated function — harmless since nothing reads it pre-implementation). Of the 2 new tests: `"applies the longshot penalty..."` FAILS (expects `30`, gets the unpenalized `100`, since the function doesn't implement the penalty yet). `"does not apply the longshot penalty..."` PASSES already — expected, since no penalty logic exists yet to incorrectly trigger below the cliff; it becomes a real regression check once Step 3 adds the penalty.

- [ ] **Step 3: Implement the penalty in `signalEngine.ts`**

Find:

```typescript
const MAGNITUDE_REFERENCE_PCT = 15;

/**
 * A composite confidence measure, separate from severity/momentumScore:
 * magnitude (weight 0.5, normalized against the existing 15% HIGH severity
 * threshold), field pressure (weight 0.3, normalized against
 * marketMaker.ts's own FIELD_PRESSURE_MAX), and freshness tightness
 * (weight 0.2). Weights are renormalized among only the available
 * components when scoresContext is absent, so a signal with no field
 * context is scored on magnitude alone rather than penalized for missing
 * data it never had a chance to have.
 */
export function calculateConfidenceScore(
  changePct: number,
  scoresContext: TxLineScoresContext | undefined,
  freshnessTightness: number | null
): number {
  const magnitudeScore = clamp((changePct / MAGNITUDE_REFERENCE_PCT) * 100, 0, 100);

  const components: { score: number; weight: number }[] = [{ score: magnitudeScore, weight: 0.5 }];

  if (scoresContext && freshnessTightness !== null) {
    const fieldPressureScore = clamp(
      ((scoresContext.fieldPressureScore ?? 0) / FIELD_PRESSURE_MAX) * 100,
      0,
      100
    );
    components.push({ score: fieldPressureScore, weight: 0.3 });
    components.push({ score: clamp(freshnessTightness, 0, 100), weight: 0.2 });
  }

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const weightedSum = components.reduce(
    (sum, component) => sum + component.score * component.weight,
    0
  );

  return round(weightedSum / totalWeight);
}
```

Replace with:

```typescript
const MAGNITUDE_REFERENCE_PCT = 15;

/**
 * Both values are derived from real signal_archive data (2026-07-11
 * investigation, 294 settled signals), not invented - but the sample
 * is modest and CONCENTRATED: only 49 settled 1X2 signals total,
 * spread across just 3 real matches, with one match's "team trailing
 * late, never comes back" narrative dominating the incorrect bucket.
 * With ~4 matches left before the July 19 deadline, there is limited
 * remaining data to re-validate this against. Treat these as
 * provisional, not authoritative - re-check against a larger sample
 * if this project continues past the tournament.
 *
 * LONGSHOT_ODDS_THRESHOLD: accuracy breaks at the same decimal-odds
 * level (3.0) independently in both markets - 1X2 60%->0% at the
 * [1,3)/[3,6) boundary, totals 62-63%->25-27% at the same boundary.
 * LONGSHOT_CONFIDENCE_FACTOR: the real combined accuracy ratio across
 * both markets - 159 settled signals below the cliff were 62.9%
 * accurate, 135 at/above it were 17.8% accurate (17.8/62.9 ~= 0.283,
 * rounded to 0.3).
 */
const LONGSHOT_ODDS_THRESHOLD = 3;
const LONGSHOT_CONFIDENCE_FACTOR = 0.3;

/**
 * A composite confidence measure, separate from severity/momentumScore:
 * magnitude (weight 0.5, normalized against the existing 15% HIGH severity
 * threshold), field pressure (weight 0.3, normalized against
 * marketMaker.ts's own FIELD_PRESSURE_MAX), and freshness tightness
 * (weight 0.2). Weights are renormalized among only the available
 * components when scoresContext is absent, so a signal with no field
 * context is scored on magnitude alone rather than penalized for missing
 * data it never had a chance to have. A longshot-odds penalty is applied
 * after this base composite (see LONGSHOT_ODDS_THRESHOLD above) - kept as
 * a separate multiplicative step, not a 4th weighted component, so the
 * base composite's own math stays unchanged for every non-longshot signal.
 */
export function calculateConfidenceScore(
  changePct: number,
  scoresContext: TxLineScoresContext | undefined,
  freshnessTightness: number | null,
  oddsAfter: number
): number {
  const magnitudeScore = clamp((changePct / MAGNITUDE_REFERENCE_PCT) * 100, 0, 100);

  const components: { score: number; weight: number }[] = [{ score: magnitudeScore, weight: 0.5 }];

  if (scoresContext && freshnessTightness !== null) {
    const fieldPressureScore = clamp(
      ((scoresContext.fieldPressureScore ?? 0) / FIELD_PRESSURE_MAX) * 100,
      0,
      100
    );
    components.push({ score: fieldPressureScore, weight: 0.3 });
    components.push({ score: clamp(freshnessTightness, 0, 100), weight: 0.2 });
  }

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const weightedSum = components.reduce(
    (sum, component) => sum + component.score * component.weight,
    0
  );

  const baseScore = round(weightedSum / totalWeight);

  return oddsAfter >= LONGSHOT_ODDS_THRESHOLD
    ? round(baseScore * LONGSHOT_CONFIDENCE_FACTOR)
    : baseScore;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/logic/signalEngine.test.ts`
Expected: the `calculateConfidenceScore` describe block's 5 tests all PASS. Some `buildSignalFromSnapshots` tests further down the file will now FAIL to compile/run correctly since `calculateConfidenceScore` is called with only 3 args at its internal call site inside `signalEngine.ts` still — that's expected, fixed in the next step.

- [ ] **Step 5: Update the `calculateConfidenceScore` call site**

Find:

```typescript
  const confidenceScore = calculateConfidenceScore(bestChangePct, scoresContext, freshnessTightness);
```

Replace with:

```typescript
  const confidenceScore = calculateConfidenceScore(bestChangePct, scoresContext, freshnessTightness, oddsAfter);
```

- [ ] **Step 6: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/logic/signalEngine.test.ts`
Expected: PASS. All tests in the file green (the existing `buildSignalFromSnapshots` confidenceScore tests use `homeOdds`/`awayOdds` of 1.5-2.0 throughout, always below the 3.0 cliff, so their expected `confidenceScore` values of `100`/`50` are unaffected).

- [ ] **Step 7: Write the failing explanation-transparency test**

Find:

```typescript
  it("falls back to a magnitude-only confidenceScore when no scoresContext is attached", () => {
    const previous = makeSnapshot({
      homeOdds: 2.0,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:00:00.000Z",
    });
    const current = makeSnapshot({
      homeOdds: 1.85,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:01:00.000Z",
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.confidenceScore).toBe(50);
  });
```

Insert immediately after it (still inside `describe("buildSignalFromSnapshots", ...)`):

```typescript

  it("reduces confidenceScore and adds the longshot caveat when oddsAfter is a longshot", () => {
    const previous = makeSnapshot({ homeOdds: 5.0, awayOdds: 2.0 });
    // 5.0 -> 3.0 is a 40% compression (HIGH severity), and oddsAfter=3.0
    // exactly meets the longshot cliff.
    const current = makeSnapshot({ homeOdds: 3.0, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.oddsAfter).toBe(3);
    // No scoresContext -> magnitude-only base score is clamped to 100
    // (40% is beyond the 15% reference), then the 0.3 longshot factor
    // applies: 100*0.3=30.
    expect(signal?.confidenceScore).toBe(30);
    expect(signal?.explanation).toContain("long-shot odds (3)");
  });

  it("does not add the longshot caveat when oddsAfter is below the cliff", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0 });
    const current = makeSnapshot({ homeOdds: 1.5, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.explanation).not.toContain("long-shot odds");
  });
```

- [ ] **Step 8: Run test to verify it fails**

Run from `apps/api`: `npx vitest run src/logic/signalEngine.test.ts`
Expected: FAIL — `signal?.confidenceScore` is `30`... actually the confidenceScore assertion should already PASS from Step 6's work; the `explanation` assertion is what FAILS here (`toContain("long-shot odds (3)")` fails because `buildContextExplanation` doesn't add that sentence yet).

- [ ] **Step 9: Add the explanation caveat in `signalEngine.ts`**

Find:

```typescript
function buildContextExplanation(
  target: string,
  signalSide: TeamSide,
  scoresContext?: TxLineScoresContext
) {
  if (!scoresContext) {
    return " No matching TXODDS Scores event context was available, so this is treated as a market-only movement.";
  }
```

Replace with:

```typescript
function buildContextExplanation(
  target: string,
  signalSide: TeamSide,
  oddsAfter: number,
  scoresContext?: TxLineScoresContext
) {
  const longshotSentence =
    oddsAfter >= LONGSHOT_ODDS_THRESHOLD
      ? ` Note: quoted at long-shot odds (${oddsAfter}) - confidence reduced accordingly, matching archived-data accuracy at this odds level.`
      : "";

  if (!scoresContext) {
    return ` No matching TXODDS Scores event context was available, so this is treated as a market-only movement.${longshotSentence}`;
  }
```

Then find:

```typescript
  return `${pressureSentence}${sideSentence}${status}${scoreline} ${reliabilitySentence}`;
}
```

Replace with:

```typescript
  return `${pressureSentence}${sideSentence}${status}${scoreline} ${reliabilitySentence}${longshotSentence}`;
}
```

Then find:

```typescript
  const explanation = `${buildBaseExplanation(
    severity,
    target,
    bestChangePct,
    oddsBefore,
    oddsAfter
  )}${buildContextExplanation(target, side, scoresContext)}`;
```

Replace with:

```typescript
  const explanation = `${buildBaseExplanation(
    severity,
    target,
    bestChangePct,
    oddsBefore,
    oddsAfter
  )}${buildContextExplanation(target, side, oddsAfter, scoresContext)}`;
```

- [ ] **Step 10: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/logic/signalEngine.test.ts`
Expected: PASS, every test in the file green.

- [ ] **Step 11: Full backend test run and build**

Run from `apps/api`: `npm run test && npm run build`
Expected: all tests pass (230 existing + 7 new = 237), clean build.

- [ ] **Step 12: Manual verification against a running dev server**

Run `npm run dev:once` in `apps/api`, wait for a few agent cycles, then from another terminal check whether any currently-live signal happens to be a longshot:

```bash
curl -s http://localhost:4000/api/signals | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const longshots = d.data.filter(s => s.oddsAfter >= 3); console.log(longshots.length, 'longshot signal(s) out of', d.data.length); if (longshots[0]) console.log(JSON.stringify({oddsAfter: longshots[0].oddsAfter, confidenceScore: longshots[0].confidenceScore, explanation: longshots[0].explanation}, null, 2));"
```

Expected: if any longshot signal exists in the current live feed, its `confidenceScore` should be visibly low (well under what its `oddsChangePct` alone would suggest) and `explanation` should contain the "long-shot odds" sentence. If none exist yet (plausible given the tournament has ~4 matches left), that's expected, not a failure — the unit tests already prove the logic correctly; live confirmation happens whenever a real longshot signal next fires (the user will check this in production per their explicit request). Stop the local API server after checking (exact PID, not pattern-kill).

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/logic/signalEngine.ts apps/api/src/logic/signalEngine.test.ts
git commit -m "Add longshot-odds confidence penalty (P1-2)"
```

---

### Task 2: PROJECT_STATE.md update

**Files:**
- Modify: `PROJECT_STATE.md`

- [ ] **Step 1: Document P1-2 completion**

Add an entry to `PROJECT_STATE.md`'s session-handoff section covering: the reframing from "recalibrate 4/8/15%" to "longshot-odds confidence penalty" and why (the real data investigation summary: 1X2 60%->0%, totals 62%->27%, both breaking at oddsAfter=3), the fix itself, the automatic Kelly Criterion benefit, the sample-size caveat, test/build counts actually observed in Task 1, and next action (report diff, user finds or waits for a real longshot signal live in production to confirm confidenceScore/explanation, then explicitly approves before push and before considering P1-1/P1-7/P1-16).

- [ ] **Step 2: Commit**

```bash
git add PROJECT_STATE.md
git commit -m "Update PROJECT_STATE.md: P1-2 implemented, awaiting review"
```

---

## Final Verification

- [ ] Run `npm run test && npm run build` from `apps/api` — all green, clean build.
- [ ] Confirm the longshot penalty logic works correctly via unit tests (live production confirmation depends on a real longshot signal firing, which the user will check for).
- [ ] Report the full diff to the user for review — do not push until they explicitly say to. This is the last item in the user's chosen Tier 3 sequencing (P1-3 then P1-2) — do not start P1-1/P1-7/P1-16 without a fresh cost/benefit discussion, since they were explicitly deferred.
