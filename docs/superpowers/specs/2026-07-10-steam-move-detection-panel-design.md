# Steam Move Detection Dashboard Panel Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

`GET /api/steam-moves` (steam move detection, item #5, built earlier this
session) detects sustained same-direction odds pressure across a sequence
of ticks — a distinct, more demanding signal than the single-tick
comparisons the main signal engine makes — and reports it live per
request. It has zero dashboard visibility today. Ranked #2 (of three
prioritized panels) in the 2026-07-10 brainstorm for judge wow-factor:
"steam move" is an intuitive, self-explanatory sharp-money story even to a
judge with zero context ("the market moved hard and fast, we caught it"),
unlike the more abstract signal-correlation or feed-health features.

Live production check at design time: `{"data":[],"summary":{"matchesScanned":24,"steamMovesDetected":0}}`
— currently 0 active steam moves. This is expected (steam moves require 3+
consecutive same-direction ticks within a 5-minute window, a real but
uncommon market condition) and the panel's empty state must read as
"working as intended, watching live," not as broken or stale.

## Component: `apps/web/src/components/SteamMoveDetectionPanel.tsx`

Follows the same self-contained, zero-props, local-types, Tailwind-only
convention as every other panel this session. Unlike the two most recent
additions (`SignalPerformancePanel`, `ConfidenceCalibrationPanel`, both
one-shot fetches over historical/aggregate data), this panel polls, because
`/api/steam-moves` reports a live, currently-true-or-not condition —
following `MarketMakerPanel`'s established live-polling convention
(`fetch` on mount, `window.setInterval(loadFn, 5000)`, mounted-guard via a
boolean flag, `clearInterval` on unmount), matching the backend's own 5s
agent cycle interval.

**Local types:**

```typescript
type SteamMove = {
  matchId: string;
  match: string;
  side: "home" | "away";
  tickCount: number;
  totalMovePct: number;
  windowMs: number;
  firstOdds: number;
  lastOdds: number;
  firstTickAt: string;
  lastTickAt: string;
};

type SteamMoveSummary = {
  matchesScanned: number;
  steamMovesDetected: number;
};
```

**Fetching:** `fetch(`${API_BASE_URL}/api/steam-moves`)` on mount and every
5000ms thereafter, reading both `data` (array, 0+) and `summary`
(`{ matchesScanned, steamMovesDetected }`) from the response.

**Rendering:**
- Header: eyebrow "Live market scan", title "Steam move detection", and a
  chip on the right showing `summary.matchesScanned` (e.g. "24 matches
  scanned") — reusing the existing chip style (`rounded-full border ...`)
  from `SignalPerformancePanel`'s "Historical accuracy" chip.
- One card per entry in `data`. Each card:
  - Match name (`move.match`) plus a small uppercase `HOME`/`AWAY` badge
    for `move.side`.
  - Headline: `{firstOdds.toFixed(2)} → {lastOdds.toFixed(2)}` with
    `({totalMovePct}%)`, styled in orange (`text-orange-300`/
    `text-orange-200`) — this app's existing accent color for market
    movement/pressure (used for asks in `MarketMakerPanel`, home-pressure
    bars elsewhere), not a new color, and not a good/bad threshold scale
    since a steam move has no "good" or "bad" reading, only magnitude.
  - Supporting text: `"{tickCount} consecutive ticks over {duration}"`,
    where `duration` is `windowMs` formatted via a small helper
    (`formatDuration`) as `"Xm Ys"` when ≥ 60s, else `"Ys"`.
- Empty state (`data.length === 0`, the common case right now):
  `"No steam move happening right now — scanning every 5s."`
- Loading state (only before the first successful fetch resolves, same as
  `MarketMakerPanel`): `"Loading steam moves..."`

No filters, no pagination — this is a small, live, typically-0-to-a-few-item
feed, not a growing historical dataset.

## `App.tsx` change

One import line, and one `<SteamMoveDetectionPanel />` render line placed
immediately after `<MarketMakerPanel />` and before `<ArenaPanel />` —
grouping it with the other live market-microstructure panel rather than
the historical-panels group at the bottom (where `SignalPerformancePanel`/
`ConfidenceCalibrationPanel` live). No edits inside any existing panel
component or any other existing file.

## Testing

No frontend test runner exists in `apps/web`. Verified via clean
`npm run build` and `npm run lint`, plus direct verification of the live
production API response shape (already done above) and a manual dev-browser
check confirming the panel polls, renders the empty state cleanly, and
doesn't break any other panel — same approach as the confidence
calibration panel. Per the session's process: merge only after user
review, then verify live in production before starting the next
(third, stretch-priority) panel.

## Out of scope (explicitly deferred)

- No filters/pagination — small, live dataset.
- No historical log of past steam moves (e.g. "steam moves detected
  today") — `detectSteamMove` only ever reports the trailing/current run
  per match, by design (see `steamDetection.ts` doc comment); a historical
  log would require new backend work, out of scope for a pure frontend
  addition.
- Signal Correlation panel — ranked #3/stretch, ranked lowest of the three
  prioritized panels; a separate brainstorm → spec → plan cycle after this
  one merges and is verified live, only if time remains.
