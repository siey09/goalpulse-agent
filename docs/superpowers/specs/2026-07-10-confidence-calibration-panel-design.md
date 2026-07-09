# Confidence Calibration Dashboard Panel Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

`GET /api/signal-performance/by-confidence` (confidence-bucketed performance,
merged 2026-07-09) answers a question no panel currently shows: does the
system's own `confidenceScore` (a composite blend of field pressure and
freshness, computed per-signal by `signalEngine.ts`) actually predict
accuracy? This is distinct from the already-shipped `SignalPerformancePanel`,
which only renders `GET /api/signal-performance` (accuracy by *signal type*)
— it never calls the by-confidence endpoint. `confidenceScore` itself is also
never rendered anywhere in the frontend today (confirmed: typed in
`SignalArchivePanel.tsx` but never displayed).

Of five session-built backend features with no dashboard surface, this one
was ranked highest-priority to build first (see brainstorm discussion,
2026-07-10): for a *trading tools* hackathon track, showing that a system's
confidence score is empirically calibrated — not cosmetic — is a stronger
credibility story than any single feature list, and it directly reinforces
the already-demoed Kelly Criterion staking in `ArenaPanel` (which sizes
stakes off this same `confidenceScore`).

## Component: `apps/web/src/components/ConfidenceCalibrationPanel.tsx`

Follows the same established convention as `SignalPerformancePanel.tsx`:
self-contained, zero props, local types, Tailwind-only styling, plain
`fetch()` in a `useEffect` with a mounted-guard, simple loading/empty
states, no polling interval (historical/aggregate data, not live odds).

**Local types:**

```typescript
type ConfidenceBucketPerformance = {
  bucket: "0-25" | "25-50" | "50-75" | "75-100";
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
};
```

**Fetching:** single `fetch(`${API_BASE_URL}/api/signal-performance/by-confidence`)`
on mount, no query params.

**Rendering:** one row per bucket returned, in ascending order
(`0-25` → `25-50` → `50-75` → `75-100`) — the API already omits buckets with
zero settled entries, so the component renders however many rows come back
(1 to 4), not a fixed set of 4. Ascending order is the point: it lets the
reader see accuracy climb alongside confidence at a glance, which is the
entire pitch of the panel.

Each row shows:
- The bucket label (e.g. `"75-100"`) as a fixed-width leading label.
- A horizontal fill bar, reusing the existing in-app progress-bar pattern
  (`<div className="h-2 rounded-full bg-white/15"><div className="h-2 rounded-full" style={{width: `${accuracyPct}%`}} /></div>`,
  as already used for market-pressure bars in `App.tsx`), width set to
  `accuracyPct`, fill color on the same threshold scale already established
  in `SignalPerformancePanel` (`>= 70` emerald-300, `>= 50` amber-300,
  `< 50` rose-300) — reusing existing colors, not introducing new ones.
- `accuracyPct`% as a trailing number.
- `correctCount`/`settledCount` as supporting detail text under the bar.

No filters, no pagination — fixed, small cardinality (at most 4 buckets),
same reasoning as `SignalPerformancePanel`.

**Empty/loading states:** "Loading confidence calibration..." while
loading; "Not enough settled, confidence-scored signals yet." if
`data.length === 0`. This empty state is more likely to trigger here than
in `SignalPerformancePanel`, since `confidenceScore` was only added to the
pipeline partway through the session (item #7) — archived signals from
before that point carry no `confidenceScore` and are excluded by the
endpoint's own logic (`summarizeConfidenceScorePerformance`). The panel
must render cleanly with 0, 1, or a handful of rows, not just the ideal
4-row case.

## `App.tsx` change

One import line and one `<ConfidenceCalibrationPanel />` render line,
placed immediately after `<SignalPerformancePanel />` (both are
archive-derived, track-record-style panels — natural to group together).
No edits inside any existing panel component or any other existing file.

## Testing

No frontend test runner exists in `apps/web` (consistent with all prior
frontend-only additions this project). Verified via clean
`npm run build`, plus direct verification of the live production API
response shape (`/api/signal-performance/by-confidence`) against what the
component expects, before merging. Per user instruction this round: verify
live in production (not just build/tests) before moving to the next panel.

## Out of scope (explicitly deferred)

- No filters/pagination — fixed, small dataset.
- No polling — historical/aggregate, not live.
- No per-signal `confidenceScore` display inside any existing panel (e.g.
  adding it to `SignalArchivePanel`) — that would mean editing an existing
  working component, which this round's constraints explicitly rule out.
  The bucketed/aggregate view here is the intended way to surface
  `confidenceScore` without touching existing panels.
- Steam Move Detection and Signal Correlation panels — ranked #2 and #3
  respectively, explicitly out of scope for this spec; each gets its own
  brainstorm → spec → plan cycle after this panel is merged and verified
  live.
