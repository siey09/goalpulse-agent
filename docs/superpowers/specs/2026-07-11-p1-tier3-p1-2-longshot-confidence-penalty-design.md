# P1 Tier 3, P1-2: Longshot-Odds Confidence Penalty

**Date:** 2026-07-11
**Status:** Approved

## Problem

The original P1-2 ask was "calibrate the 4%/8%/15% severity thresholds
using real archived samples." Investigating 294 real settled rows from
`signal_archive` (via the production `GET /api/archive` read endpoint)
found the severity percentage thresholds are **not** the real problem —
recalibrating them to different percentage values would not be
justified by this data.

Instead, a much cleaner and more specific pattern emerged: accuracy
correlates almost perfectly with the underlying **decimal odds level**
at signal time, not with the percentage-compression magnitude that
severity is based on.

**1X2 market (49 settled signals):** correct signals averaged
`oddsAfter` 1.09 (genuine favorites); incorrect signals averaged
161.30 (extreme longshots). Bucketed:

| `oddsAfter` | n | Accuracy |
|---|---|---|
| [1, 3) | 5 | 60.0% |
| [3, 6) | 8 | 0.0% |
| [6, 15) | 2 | 0.0% |
| [15, 1000) | 34 | 0.0% |

**Totals market (245 settled signals)** shows the identical cliff at
the same odds level, just without reaching 1X2's extreme values (max
odds 18.4 vs 720):

| `oddsAfter` | n | Accuracy |
|---|---|---|
| [1, 2) | 112 | 63.4% |
| [2, 3) | 42 | 61.9% |
| [3, 5) | 44 | 27.3% |
| [5, 1000) | 47 | 25.5% |

The mechanism: percentage-compression is scale-relative, so a
longshot's price naturally swings by large percentages from small
absolute moves (e.g. 610→380 is "43% compression," the same magnitude
class as a real favorite tightening), without that swing meaning
anything about who actually wins. Manually inspecting the raw 1X2 rows
confirmed this directly — most incorrect 1X2 signals fired on the
*already-losing* team deep in a match (e.g. Morocco down 2-0), which
essentially never wins outright from there in a knockout match.

User reviewed this finding directly and chose to build a real fix
(over a visibility-only or document-only alternative).

## Fix — `calculateConfidenceScore` longshot penalty

`logic/signalEngine.ts`'s `calculateConfidenceScore` is a composite
0-100 score (magnitude weight 0.5, fieldPressure 0.3, freshness 0.2,
renormalized when `scoresContext` is absent) already wired into the
just-shipped Confidence Calibration dashboard panel and into Arena's
Kelly Criterion stake sizing (`calculateKellyStake(oddsTaken,
confidenceScore)` in `logic/arena.ts`). This is the correct existing
mechanism to carry the fix — no change to severity, `signalType`, or
whether a signal gets generated at all.

New parameter `oddsAfter: number`. The existing 3-component weighted
composite computes exactly as it does today, unchanged — a
multiplicative penalty is applied only after that, only when
`oddsAfter` crosses the data-derived cliff:

```typescript
/**
 * Both values are derived from real signal_archive data (2026-07-11
 * investigation, 294 settled signals), not invented — but the sample
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
 * accurate, 135 at/above it were 17.8% accurate (17.8/62.9 ≈ 0.283,
 * rounded to 0.3).
 */
const LONGSHOT_ODDS_THRESHOLD = 3;
const LONGSHOT_CONFIDENCE_FACTOR = 0.3;
```

```typescript
export function calculateConfidenceScore(
  changePct: number,
  scoresContext: TxLineScoresContext | undefined,
  freshnessTightness: number | null,
  oddsAfter: number
): number {
  // ...existing magnitudeScore/components/totalWeight/weightedSum logic, unchanged...

  const baseScore = round(weightedSum / totalWeight);

  return oddsAfter >= LONGSHOT_ODDS_THRESHOLD
    ? round(baseScore * LONGSHOT_CONFIDENCE_FACTOR)
    : baseScore;
}
```

`buildSignalFromSnapshots` passes its already-computed `oddsAfter`
into the new parameter — a one-line call-site change, no new data
dependency.

## Second-order effect: Kelly Criterion (no code change)

`calculateKellyStake(oddsAfter, confidenceScore)` in `logic/arena.ts`
already scales its stake down as `confidenceScore` drops. Once
longshot signals honestly report low confidence, Kelly's stakes on
them shrink automatically — a real improvement to the Arena's
currently worst-performing exposure, achieved without touching
`arena.ts` at all.

## Explanation transparency

`buildContextExplanation` (also in `signalEngine.ts`) gets one more
conditional sentence, appended only when the penalty actually applied,
matching its existing style of surfacing caveats (reliability
warnings, side-conflict cautions already live there):

```typescript
const longshotSentence =
  oddsAfter >= LONGSHOT_ODDS_THRESHOLD
    ? ` Note: quoted at long-shot odds (${oddsAfter}) — confidence reduced accordingly, matching archived-data accuracy at this odds level.`
    : "";
```

Appended to the existing explanation string alongside the other
conditional sentences.

## Testing

**`calculateConfidenceScore`:** the 3 existing tests in
`signalEngine.test.ts` gain a 4th argument (`oddsAfter: 1.5`, below
the cliff) — expected outputs unchanged, confirming the base composite
math is untouched. New tests: `oddsAfter` at/above 3 applies the 0.3
factor to an otherwise-identical composite; `oddsAfter` just under 3
does not apply it (boundary check at exactly 3.0 and at 2.99).

**`buildSignalFromSnapshots`:** one new integration test confirming a
signal built from snapshots implying `oddsAfter >= 3` has a reduced
`confidenceScore` versus the same inputs at `oddsAfter < 3`, and that
its `explanation` contains the longshot caveat sentence.

## Out of scope

- Severity/`signalType`/signal-generation logic — untouched, confirmed
  by the data investigation to not be the real issue.
- Any change to `arena.ts` — the Kelly Criterion benefit is automatic,
  requires no code.
- Any other Tier 3 item (P1-1, P1-7, P1-16) — deferred per the user's
  earlier cost/benefit ordering, unaffected by this change.
