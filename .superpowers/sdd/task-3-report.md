# Task 3 report — market-tape chart and restrained animation

## Outcome

- Replaced category spacing and smoothed interpolation with a numeric `timelineX` time axis and `stepAfter` price areas.
- Kept Home, Draw, and Away price animation disabled; added a bright latest-capture cursor and terminal dots.
- Reduced grid contrast and limited motion to motion-safe cursor/scrub transitions with `motion-reduce:transition-none`.
- Expanded the tooltip with snapshot position, full local capture date/time, all available prices, and signal evidence.
- Added a segmented historical scrub rail with start/current/end labels and a polite replay-position status.
- Missing timestamps consistently render as `Capture time unavailable`.

## TDD evidence

### RED

Command:

`npm.cmd test -- src/features/markets/OddsMovementChart.test.tsx`

Result before production changes: **2 failed, 6 passed**.

Expected failures:

1. Missing `Historical capture time` / step-tape semantics and numeric time-axis configuration.
2. Missing accessible replay-position status (`Snapshot 2 of 3 … Historical`).

### GREEN

Same focused command after implementation: **10 passed, 0 failed**. Two additional review-driven regressions verify that synthetic timeline coordinates never become displayed dates and an incomplete replay never claims its current point is the historical end.

The component tests inspect Recharts props and verify every rendered price area is `type="stepAfter"` with `isAnimationActive={false}`, and the X axis uses `timelineX`, `type="number"`, and `scale="time"`.

## Verification

- `npm.cmd test -- src/features/markets/OddsMovementChart.test.tsx src/features/markets/LiveMarketsPage.smoke.test.tsx` — **13 passed**.
- `npm.cmd run lint` — **passed**.
- `npm.cmd run build` — **passed**; Vite retains the existing non-fatal warning for a chunk over 500 kB.
- `git diff --check` — **passed** (Git emitted only the workspace's LF-to-CRLF notices).

The full lint run exposed an inherited Task 2 empty-interface rule violation. `LiveMarketsChartPoint` was changed to the type-alias equivalent; this has no runtime effect.

## Self-review

- Existing draw-series visibility, keyboard signal action, collision-safe row keys, chart naming, and finished-empty behavior remain covered and green.
- Signal markers continue to use numeric X coordinates and stable marker IDs.
- No replay controls or replay state management were changed.
- Recharts v3 type checking rejected unsupported `isFront` props during the first build attempt; those props were removed before final verification.
- Independent review identified synthetic-time, incomplete-end, and inert-cursor issues. These were addressed with two RED/GREEN regressions, conditional truthful labelling, and a keyed 300 ms opacity/scale cursor entrance limited to `prefers-reduced-motion: no-preference`.

## Remaining concern

- Production build output still reports the pre-existing large main-chunk advisory; bundle splitting is outside Task 3.
