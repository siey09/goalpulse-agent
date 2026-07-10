# Odds Movement Chart: Severity Markers, Richer Tooltips, Persistent Signal Points

**Date:** 2026-07-10
**Status:** Approved

## Problem

The "Odds movement over time" chart (`apps/web/src/App.tsx`, inside the
overview section) has two related shortcomings in how it surfaces signal
markers:

1. **Markers carry no severity/confidence signal.** All `ReferenceDot`
   markers use the same fixed radius (`r={5}`) and are colored only by
   which side (home/away) they're plotted on. The tooltip that appears for
   a marker's x-position shows label/target/odds-before-after/move-% but
   nothing about *why* the signal fired — no confidence score, no field
   pressure, no reasoning text — even though all three already exist on
   the signal object and are already displayed elsewhere
   (`SignalIntelligencePanel.tsx`).
2. **Markers disappear once their snapshot ages out of the chart window.**
   `chartData` is hardcoded to `oddsHistory.slice(-18)`. Once 18 newer SSE
   ticks arrive, any snapshot older than that — including ones a marker is
   anchored to — falls out of `chartData` entirely. Because
   `chartSignalMarkers`' matching is also fragile (compares
   `formatTime()` strings, which only have minute precision) it silently
   falls back to `chartData[Math.max(chartData.length - 1 - index * 3, 0)]`
   — an arbitrary nearby point — rather than failing loudly. Net effect: a
   signal's marker either vanishes or gets misattributed to the wrong
   point once enough time passes, even though the backend already sends up
   to 100 historical snapshots per tick (`apps/api/src/server.ts:235`,
   `.slice(0,100).reverse()`) — the data to place it correctly is already
   on the client, it's just being discarded.

Both fixes are scoped to the odds movement chart only. No other panel, no
backend change, no new dependency.

## Confidence source decision

The backend already computes and attaches `confidenceScore` to every
signal (`apps/api/src/logic/signalEngine.ts:207,252`,
`calculateConfidenceScore`) — this is the same number the Confidence
Calibration panel and analyst chat use. Separately,
`SignalIntelligencePanel.tsx:89` has its own private client-side heuristic,
`calculateConfidence()`, used only for that one panel's own metric card and
not exposed anywhere else.

**Decision (user-confirmed):** the chart tooltip shows `signal.confidenceScore`
(the backend field), not `SignalIntelligencePanel`'s heuristic. This keeps
the number consistent with every other surface that shows "confidence" in
the app, and requires no logic extraction — just typing the field that
already arrives on the wire.

Field pressure (`evidence.scoresContext.fieldPressureScore`) and reasoning
text (`signal.explanation`) are already simple, unambiguous field
passthroughs — `explanation` is already typed on `AgentSignal` today and is
the exact same field `SignalIntelligencePanel` displays verbatim as its
"why" text.

## Secondary confidence/field-pressure strip: rejected

Considered an RSI-style strip below the main chart plotting
confidence/field-pressure over time. Rejected: those values only exist at
the sparse handful of x-positions where a signal actually fired (at most
3), not at every snapshot the way RSI is computed from every price bar. A
continuous strip would be empty for nearly the entire timeline and only
show real data at up to 3 points — a poor fit for the "indicator strip"
pattern, for meaningful added rendering/layout complexity. Severity-coded
markers plus richer hover tooltips deliver the same information at the
exact point it's relevant, for much less risk.

## Change 1: Severity-coded markers

Replace the current side-based fill with severity-based fill + radius.
Side remains visible from which line/Y-position the dot sits on.

| `signal.severity` | Fill | Radius |
|---|---|---|
| `"HIGH"` | `#f87171` (rose) | `7` |
| `"MEDIUM"` | `#fbbf24` (amber) | `5.5` |
| anything else (`"LOW"` / undefined) | `#94a3b8` (slate) | `4` |

Stroke stays `#fff7ed` at all sizes.

A small helper, colocated with the other chart helpers in `App.tsx`:

```typescript
function severityMarkerStyle(severity?: string) {
  if (severity === "HIGH") return { fill: "#f87171", radius: 7 };
  if (severity === "MEDIUM") return { fill: "#fbbf24", radius: 5.5 };
  return { fill: "#94a3b8", radius: 4 };
}
```

`chartSignalMarkers` gains a `severity` field (`signal.severity`) so the
render site can call `severityMarkerStyle(marker.severity)` per dot.

**Legend** (`App.tsx` ~line 2489-2492): replace the single "Signal detected
here" swatch with three severity swatches, reusing the same colors:

```tsx
<span className="flex items-center gap-1.5">
  <span className="h-2 w-2 rounded-full border border-orange-100 bg-[#f87171]" />
  High severity
</span>
<span className="flex items-center gap-1.5">
  <span className="h-2 w-2 rounded-full border border-orange-100 bg-[#fbbf24]" />
  Medium severity
</span>
<span className="flex items-center gap-1.5">
  <span className="h-2 w-2 rounded-full border border-orange-100 bg-[#94a3b8]" />
  Low severity
</span>
```

## Change 2: Tooltip enrichment

`AgentSignal` (`App.tsx:65-100`) widened — add `confidenceScore?: number`
and extend `evidence.scoresContext` with `fieldPressureScore?: number`
(the only two new fields needed; `explanation` already exists):

```typescript
type AgentSignal = {
  // ...existing fields unchanged...
  confidence?: number;
  confidenceScore?: number;
  explanation?: string;
  // ...existing fields unchanged...
  evidence?: {
    marketType?: string;
    fixtureId?: string;
    scoresContext?: {
      sequence?: number;
      fieldPressureScore?: number;
    };
  };
  // ...existing fields unchanged...
};
```

`chartSignalMarkers` gains three fields carried straight from the matched
signal, no computation:

```typescript
confidenceScore: signal.confidenceScore,
fieldPressureScore: signal.evidence?.scoresContext?.fieldPressureScore,
explanation: signal.explanation,
```

Tooltip's existing marker detail block (`App.tsx:2387-2396`) gains three
lines after the existing "Move: ..." line:

```tsx
<p>Confidence: {marker.confidenceScore != null ? `${marker.confidenceScore}%` : "—"}</p>
<p>Field pressure: {marker.fieldPressureScore != null ? marker.fieldPressureScore : "—"}</p>
{marker.explanation && <p className="mt-1 text-orange-50/80">{marker.explanation}</p>}
```

No new components, no new state — pure additive rendering inside the
existing conditional block.

## Change 3: Signal-marker persistence

Replace both `chartData` and `chartSignalMarkers`' matching logic together
(they're interdependent — the fix requires computing must-keep points
before truncating).

**Nearest-snapshot matching** — replace the current
`formatTime(point.rawTimestamp) === formatTime(signal.createdAt)` string
comparison (minute-precision only, why the fallback hack exists today)
with real timestamp-proximity matching against the *full* `oddsHistory`,
not a pre-truncated slice:

```typescript
function findNearestSnapshot(
  history: OddsSnapshot[],
  targetTimestamp?: string
): OddsSnapshot | undefined {
  if (!targetTimestamp || history.length === 0) return undefined;

  const targetMs = new Date(targetTimestamp).getTime();
  if (Number.isNaN(targetMs)) return undefined;

  let closest: OddsSnapshot | undefined;
  let closestDelta = Infinity;

  for (const snapshot of history) {
    const snapshotMs = new Date(snapshot.timestamp ?? "").getTime();
    if (Number.isNaN(snapshotMs)) continue;

    const delta = Math.abs(snapshotMs - targetMs);
    if (delta < closestDelta) {
      closestDelta = delta;
      closest = snapshot;
    }
  }

  return closest;
}
```

**`chartData` rework** — build from the full `oddsHistory`, always
including the snapshots nearest to the (up to 3) most recent signals for
the selected match, then filling out the rest of a ~18-point readable
window from the most recent remaining snapshots:

```typescript
const MAX_NON_SIGNAL_CHART_POINTS = 18;

const chartData = useMemo(() => {
  const relatedSignals = selectedMatch
    ? signals.filter((signal) => signal.matchId === selectedMatch.id).slice(0, 3)
    : [];

  const mustKeepIds = new Set<string>();
  for (const signal of relatedSignals) {
    const nearest = findNearestSnapshot(oddsHistory, signal.createdAt);
    if (nearest?.id) mustKeepIds.add(nearest.id);
  }

  const mustKeepSnapshots = oddsHistory.filter(
    (snapshot) => snapshot.id && mustKeepIds.has(snapshot.id)
  );
  const nonSignalSnapshots = oddsHistory.filter(
    (snapshot) => !snapshot.id || !mustKeepIds.has(snapshot.id)
  );
  const recentNonSignal = nonSignalSnapshots.slice(-MAX_NON_SIGNAL_CHART_POINTS);

  const merged = [...mustKeepSnapshots, ...recentNonSignal].sort((a, b) => {
    const aMs = new Date(a.timestamp ?? "").getTime();
    const bMs = new Date(b.timestamp ?? "").getTime();
    return aMs - bMs;
  });

  return merged.map((snapshot, index) => {
    const odds = snapshot.market ?? snapshot;
    const snapshotNumber = index + 1;
    const hasTimestamp = Boolean(snapshot.timestamp);

    return {
      name: hasTimestamp ? formatTime(snapshot.timestamp) : `S${snapshotNumber}`,
      snapshotLabel: `TxLINE snapshot ${snapshotNumber}`,
      timelineLabel: hasTimestamp
        ? `Captured at ${formatTime(snapshot.timestamp)}`
        : `Replay snapshot ${snapshotNumber}`,
      rawTimestamp: snapshot.timestamp ?? "",
      home: odds.homeOdds,
      draw: odds.drawOdds,
      away: odds.awayOdds,
    };
  });
}, [oddsHistory, selectedMatch, signals]);
```

Notes:
- Snapshots without an `id` are treated as never-must-keep (can't be
  deduped/tracked reliably) but still flow through `nonSignalSnapshots`
  normally, so they aren't dropped outright — just not protected.
  Backend snapshots always carry `id` in practice, so this is a defensive
  fallback, not the common path.
- Total displayed points is usually 18, occasionally up to 21 when a
  signal's snapshot is older than the 18 most recent non-signal points.
- Chronological sort matches the existing ascending-order convention
  established by the earlier odds-history ordering fix
  (`mergeOddsSnapshots`).

**`chartSignalMarkers` rework** — matches against the final `chartData`
(guaranteed to contain the must-keep snapshot now), so the
`fallbackPoint` approximation is removed entirely:

```typescript
const chartSignalMarkers = useMemo(() => {
  if (!selectedMatch || chartData.length === 0) return [];

  const relatedSignals = signals.filter((signal) => signal.matchId === selectedMatch.id);

  return relatedSignals.slice(0, 3).flatMap((signal, index) => {
    const side = (signal.side ?? "").toLowerCase();
    const dataKey = side === "away" ? "away" : "home";

    const nearestSnapshot = findNearestSnapshot(oddsHistory, signal.createdAt);
    const nearestPoint = nearestSnapshot
      ? chartData.find((point) => point.rawTimestamp === (nearestSnapshot.timestamp ?? ""))
      : undefined;

    if (!nearestPoint) return [];

    return [
      {
        id: signal.id ?? `${signal.matchId}-${index}`,
        x: nearestPoint.name,
        y: Number(signal.oddsAfter ?? nearestPoint[dataKey]),
        dataKey,
        label: signalTypeLabel(getSignalType(signal)),
        target: getSignalTarget(signal),
        severity: signal.severity,
        confidenceScore: signal.confidenceScore,
        fieldPressureScore: signal.evidence?.scoresContext?.fieldPressureScore,
        explanation: signal.explanation,
        oddsBefore: signal.oddsBefore,
        oddsAfter: signal.oddsAfter,
        oddsChangePct: signal.oddsChangePct,
        trapStatus: signal.trapStatus,
        reversalRisk: signal.reversalRisk,
        scoreRealityStatus: signal.scoreRealityStatus,
      },
    ];
  });
}, [selectedMatch, chartData, signals, oddsHistory]);
```

`flatMap` returning `[]` for a signal whose snapshot didn't survive
`chartData` (shouldn't happen given the must-keep logic above, but keeps
the function total rather than relying on a synthetic fallback point) —
this is strictly safer than today's behavior, never worse.

**`ReferenceDot` render site** (`App.tsx:2429-2445`) — use
`severityMarkerStyle(marker.severity)` for `fill`/`r` instead of the
side-based fill:

```tsx
{chartSignalMarkers.map((marker) => {
  const style = severityMarkerStyle(marker.severity);
  return (
    <ReferenceDot
      key={marker.id}
      x={marker.x}
      y={marker.y}
      r={style.radius}
      stroke="#fff7ed"
      strokeWidth={2}
      fill={style.fill}
      label={{
        value: "Signal",
        position: "top",
        fill: "#fed7aa",
        fontSize: 10,
      }}
    />
  );
})}
```

## Testing

No frontend test runner exists in `apps/web`. Verified via clean
`npm run build` (`tsc -b && vite build`, with `noUnusedLocals`/
`noUnusedParameters` enforced) and `npm run lint`, plus a manual dev-browser
check: select a match with signal history, confirm markers render with
severity colors/sizes, confirm tooltip shows confidence/field
pressure/reasoning, and confirm a marker survives past 18+ subsequent SSE
ticks (verified either by watching a live match accumulate ticks, or by
temporarily lowering `MAX_NON_SIGNAL_CHART_POINTS` in a local build to force
the aging-out condition faster, then reverting before commit). Per the
session's process: merge only after user review, then verify live in
production.

## Out of scope (explicitly deferred)

- No secondary RSI-style confidence/field-pressure strip (see rejection
  above).
- No change to any other panel, including `SignalIntelligencePanel.tsx`
  itself — its private `calculateConfidence()` heuristic is untouched and
  unreferenced by this work.
- No backend change — `confidenceScore`, `fieldPressureScore`, and
  `explanation` are all already sent by the API today.
- No dedup/fix of the `formatTime()` minute-precision collision on the
  chart's x-axis category labels (two snapshots in the same minute would
  still share an x-axis label) — a pre-existing, separate issue not
  touched by this work.
