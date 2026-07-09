# Signal Correlation Dashboard Panel Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

`GET /api/signal-correlation/patterns` (pattern-matched signal correlation,
built 2026-07-09) reports when the SAME pattern — side + severity + market
— repeats across 2+ distinct matches within a 5-minute window: a stricter,
more specific claim than the plain `/api/signal-correlation` endpoint's
"any signals fired close together." It has zero dashboard visibility
today. Ranked #3 (stretch priority, of three panels) in the 2026-07-10
brainstorm: sophisticated ("we detect coordinated patterns across
simultaneous matches, not just single signals") but more abstract to
present than Confidence Calibration or Steam Move Detection, hence lowest
of the three.

**Data-quality finding made during this brainstorm, before committing to a
design:** a totals signal's `matchId` has the shape
`<fixtureId>-totals-<line>` (six different total-goals lines on the same
real match produce six different `matchId` values). Neither
`findSignalClusters` nor `findPatternMatchedClusters`
(`apps/api/src/logic/signalCorrelation.ts`) account for this — they group
purely by raw `matchId`. This is the exact overcounting bug already found
and fixed for Signal Performance on 2026-07-09 via a `baseMatchId` dedup
helper (`apps/api/src/logic/signalPerformance.ts:20`), but the fix was
never applied here.

Manually deduping live production data by real match at design time: of
the 7 clusters `/api/signal-correlation/patterns` currently reports, 6 are
a single match (`18209181`) firing the same pattern across its own totals
lines — not cross-match correlation. Only 1 is genuine: the same
LOW-severity home totals signal fired on two different real matches
(`18218149`, `18213979`) 3.5 minutes apart. Displaying the raw
`matchCount`/`matchIds` fields as-is (e.g. a cluster claiming 14 "matches"
that's actually one match's totals markets) would misrepresent a
single-match artifact as sophisticated cross-market intelligence — contrary
to this project's established honesty standard (Signal Performance
deliberately shows SHARP_MOVE's real 33% rather than hiding it).

**Decision (user-confirmed):** dedup client-side and filter to genuine
clusters only. Pure frontend logic, no backend endpoint change — lower
risk this close to the July 19 deadline than extending
`signalCorrelation.ts` with server-side dedup fields, which is deferred
(see "Out of scope" below).

## Component: `apps/web/src/components/SignalCorrelationPanel.tsx`

Self-contained, zero-props, local types, Tailwind-only, matching every
other panel's convention. One-shot fetch on mount (no polling) — like
`ConfidenceCalibrationPanel`, this scans the full stored signal history;
it's historical/aggregate, not a live "right now" condition.

**Local types (matching the `PatternCluster` shape returned by the API):**

```typescript
type PatternCluster = {
  side: "home" | "away";
  severity: "HIGH" | "MEDIUM" | "LOW";
  market: "1x2" | "totals";
  matchIds: string[];
  matchCount: number;
  signalCount: number;
  windowStart: string;
  windowEnd: string;
  spanMs: number;
  signalIds: string[];
};
```

**Fetching:** `fetch(`${API_BASE_URL}/api/signal-correlation/patterns`)` on
mount, reading `payload.data` as `PatternCluster[]`.

**Client-side dedup and filter (the core correctness logic of this
panel):**

```typescript
function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}

function distinctRealMatches(matchIds: string[]): string[] {
  return Array.from(new Set(matchIds.map(baseMatchId)));
}
```

For each `PatternCluster`, compute `distinctRealMatches(cluster.matchIds)`.
Keep only clusters where this array's length is `>= 2`. This mirrors
`baseMatchId` in `signalPerformance.ts` exactly (same suffix-stripping
logic), applied client-side instead of server-side per the decision above.

**Rendering:** one card per surviving (post-filter) cluster:
- A pattern badge: `"{side} · {severity} · {market}"` uppercased (e.g.
  "HOME · LOW · TOTALS"), styled like the existing side/severity badge
  conventions elsewhere in the app.
- Headline: the deduped match count, e.g. `"2 real matches"` — this
  number, not the raw `matchCount`, is what's displayed anywhere in this
  panel.
- Supporting line: `"{signalCount} signals over {duration}"`, where
  `duration` is `spanMs` formatted via a local `formatDuration` helper
  (`"Xm Ys"` / `"Ys"` — same small helper duplicated per-panel, matching
  this codebase's established per-component self-containment convention
  rather than a shared util).
- The deduped base match IDs listed as small badges (e.g. "Match
  18218149", "Match 18213979") — no team-name resolution, which would
  require a second fetch/join against `/api/matches`, out of scope for a
  simple panel.

**Empty state:** if zero clusters survive the filter (the likely current
state — only 1 genuine cluster exists in production today, and it may or
may not still be within scan range by the time this ships):
`"No cross-match signal patterns detected yet."` — phrased as a normal,
expected state (genuine cross-match correlation is real but naturally
uncommon, especially as the tournament narrows to ~4 remaining matches),
not as an error.

**Loading state:** `"Loading signal correlation..."`, matching the other
historical panels' phrasing convention.

No filters, no pagination — small, filtered dataset.

## `App.tsx` change

One import line and one `<SignalCorrelationPanel />` render line, placed
immediately after `<ConfidenceCalibrationPanel />` and before
`<VerifiedCaseStudiesPanel />` — grouped with the other
historical/analytics panels (`SignalPerformancePanel`,
`ConfidenceCalibrationPanel`), not the live-polling panels
(`MarketMakerPanel`, `SteamMoveDetectionPanel`). No edits inside any
existing panel component or any other existing file.

## Testing

No frontend test runner exists in `apps/web`. Verified via clean
`npm run build` and `npm run lint`, plus direct verification of the live
production API response shape and a manual dedup/filter pass against real
data (already done above — confirms exactly 1 cluster currently survives
the filter), and a manual dev-browser check confirming the panel renders
correctly and doesn't break any other panel. Per the session's process:
merge only after user review, then verify live in production.

## Out of scope (explicitly deferred)

- No filters/pagination — small, filtered dataset.
- No polling — historical/aggregate scan, not live.
- No server-side fix to `signalCorrelation.ts` (adding
  `distinctMatchCount`/`largestMatchSharePct` fields matching the
  Signal Performance precedent) — user explicitly chose the
  lower-risk, frontend-only dedup for this round, given the July 19
  deadline. A future session could still make this backend-correct
  the same way Signal Performance already is.
- No team-name resolution for match badges (would need a second
  fetch/join against `/api/matches`).
- Plain `/api/signal-correlation` (non-pattern-matched) endpoint — not
  surfaced in this panel; the pattern-matched variant is the stronger,
  single story chosen to keep the panel simple and singular.
- This is the last of the three prioritized panels from the 2026-07-10
  brainstorm (Confidence Calibration and Steam Move Detection already
  shipped). Feed Health Monitoring remains explicitly deprioritized
  (lowest judge wow-factor) and out of scope entirely for this round.
