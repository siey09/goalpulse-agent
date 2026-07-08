# Signal Performance Dashboard Panel Design

**Date:** 2026-07-09
**Status:** Approved (user directive: proceed using best judgment given deadline urgency)

## Problem

`GET /api/signal-performance` (item #7, built earlier this session) reports
real, honest historical accuracy per signal type from the settled archive —
confirmed live right now: WATCH 88% (52 settled), MOMENTUM_SHIFT 87% (23
settled), SHARP_MOVE only 33% (27 settled). This is exactly the kind of
concrete, credible track-record evidence a judge would want to see, and it
has zero dashboard visibility today. Along with feed health, steam
detection, both signal-correlation variants, and confidence scoring, it's
one of several capabilities built this session that exist only as backend
routes. Given the user's explicit priority (judge-facing completeness over
further backend depth, given the July 19 deadline), this is the single
highest-leverage piece to surface: it doesn't just show a feature exists,
it proves the system's signals have a measurable track record — including
an honest, not-cherry-picked one (SHARP_MOVE's 33% is left visible, not
hidden).

## Component: `apps/web/src/components/SignalPerformancePanel.tsx`

Follows the exact same established convention as `SignalArchivePanel.tsx`
(this session's only other frontend addition): self-contained, zero props,
local types, Tailwind-only styling, plain `fetch()` in a `useEffect` with a
mounted-guard, simple loading/empty states, no polling interval (this is
historical/aggregate data, not live odds — matches the archive panel's own
reasoning for skipping polling).

**Local types:**

```typescript
type SignalTypePerformance = {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
};
```

**Fetching:** single `fetch(`${API_BASE_URL}/api/signal-performance`)` on
mount, no query params (the endpoint takes none).

**Rendering:** one card per signal type, largest `settledCount` first (a
type reported on more settled signals is a more statistically meaningful
number, worth surfacing prominently first). Each card shows:
- `signalType` as a label
- A large `accuracyPct` number, color-coded on a threshold scale
  (`>= 70` emerald, `>= 50` amber, `< 50` rose) — reusing the established
  emerald/amber/rose severity-adjacent palette from every other panel this
  session, not inventing new colors.
- `correctCount`/`incorrectCount` out of `settledCount` as supporting
  detail text.

No filters, no pagination — this is a small, fixed-cardinality summary
(at most 4 signal types exist: SHARP_MOVE/WATCH/MOMENTUM_SHIFT/NO_ACTION),
unlike the archive panel which needed both for a large, growing dataset.

**Empty/loading states:** matches the archive panel's text-block
convention — "Loading signal performance..." while loading, "No settled
signals yet." if `data.length === 0`.

## `App.tsx` change

One import line and one `<SignalPerformancePanel />` render line, placed
immediately after `<SignalArchivePanel />` (both are archive-derived,
track-record-style panels — natural to group together).

## Testing

Same as the archive panel: no frontend test runner exists in `apps/web`.
Verified via clean build (`npm run build`) plus direct verification of the
exact API response shape against production (already done above,
confirming the type and field names match what the component expects) —
matching this session's established approach for the one other frontend
feature it built.

## Out of scope (explicitly deferred)

- No filters/pagination — fixed, small dataset, unlike the archive.
- No polling — historical/aggregate, not live.
- No combination with the Arena backtest data in the same panel — kept as
  a single, focused, quickly-shippable panel rather than a more complex
  multi-source one, given the priority is shipping *something real*
  before the deadline over a more ambitious combined view.
