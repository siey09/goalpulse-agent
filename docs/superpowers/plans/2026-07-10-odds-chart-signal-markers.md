# Odds Chart Signal Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Color/size-code the odds chart's signal markers by severity, enrich their hover tooltips with confidence/field-pressure/reasoning (passthrough only), and fix marker persistence so a signal-marked point is never dropped from the chart even after 18+ subsequent updates.

**Architecture:** All changes live in `apps/web/src/App.tsx`. `chartData` and `chartSignalMarkers` (currently two separate `useMemo`s, one hardcoded to `oddsHistory.slice(-18)`) are rewritten together: a new `findNearestSnapshot` helper matches signals to snapshots by real timestamp proximity (not the current minute-precision string comparison), `chartData` always includes those matched snapshots plus a capped, most-recent sample of the rest, and `chartSignalMarkers` matches against that guaranteed-correct `chartData`. A new `severityMarkerStyle` helper drives `ReferenceDot` fill/radius. The tooltip's existing marker-detail block gains three more lines, reading fields already carried on the marker object.

**Tech Stack:** React 19 + TypeScript, Recharts 3.9, Vite. No new dependencies.

## Global Constraints

- Frontend-only. No backend changes, no new dependencies (per spec).
- `apps/web/tsconfig.app.json` has `noUnusedLocals: true` and `noUnusedParameters: true` — every helper function/local variable introduced in a task must be consumed within that same task, or the build fails.
- Do not touch any panel or chart behavior other than what's in the spec (`docs/superpowers/specs/2026-07-10-odds-chart-signal-markers-design.md`).
- Confidence value shown is `signal.confidenceScore` (backend field), never `SignalIntelligencePanel`'s private `calculateConfidence()` heuristic — that file is not touched by this plan.
- Verify with `npm run build` (`tsc -b && vite build`, run from `apps/web`) after every task — this is the only verification mechanism (no frontend test runner exists in `apps/web`).

---

### Task 1: Widen `AgentSignal` type for confidence score and field pressure

**Files:**
- Modify: `apps/web/src/App.tsx:65-100` (the `AgentSignal` type)

**Interfaces:**
- Produces: `AgentSignal.confidenceScore?: number` and `AgentSignal.evidence.scoresContext.fieldPressureScore?: number`, both consumed by Task 2 (chart-marker construction) and Task 4 (tooltip render).

- [ ] **Step 1: Add the two new optional fields to `AgentSignal`**

In `apps/web/src/App.tsx`, find the `AgentSignal` type (currently lines 65-100):

```typescript
type AgentSignal = {
  id?: string;
  matchId?: string;
  match?: string;
  team?: string;
  target?: string;
  side?: string;
  type?: string;
  signalType?: string;
  severity?: string;
  oddsBefore?: number;
  oddsAfter?: number;
  oddsChangePct?: number;
  momentumScore?: number;
  confidence?: number;
  explanation?: string;
  reason?: string;
  createdAt?: string;
  resultStatus?: string;
  trapStatus?: string;
  trapScore?: number;
  trapReason?: string;
  reversalRisk?: string;
  reversalReason?: string;
  finalScore?: string;
  scoreRealityStatus?: string;
  scoreRealityReason?: string;
  evidence?: {
    marketType?: string;
    fixtureId?: string;
    scoresContext?: {
      sequence?: number;
    };
  };
  discordAlertStatus?: "sent" | "failed" | "not_configured";
};
```

Replace with:

```typescript
type AgentSignal = {
  id?: string;
  matchId?: string;
  match?: string;
  team?: string;
  target?: string;
  side?: string;
  type?: string;
  signalType?: string;
  severity?: string;
  oddsBefore?: number;
  oddsAfter?: number;
  oddsChangePct?: number;
  momentumScore?: number;
  confidence?: number;
  confidenceScore?: number;
  explanation?: string;
  reason?: string;
  createdAt?: string;
  resultStatus?: string;
  trapStatus?: string;
  trapScore?: number;
  trapReason?: string;
  reversalRisk?: string;
  reversalReason?: string;
  finalScore?: string;
  scoreRealityStatus?: string;
  scoreRealityReason?: string;
  evidence?: {
    marketType?: string;
    fixtureId?: string;
    scoresContext?: {
      sequence?: number;
      fieldPressureScore?: number;
    };
  };
  discordAlertStatus?: "sent" | "failed" | "not_configured";
};
```

- [ ] **Step 2: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors (purely additive optional fields on an existing type — nothing consumes them yet, which is fine since these are type properties, not local variables, so `noUnusedLocals` doesn't apply to them).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Widen AgentSignal type with confidenceScore and fieldPressureScore"
```

---

### Task 2: Fix signal-marker persistence (`chartData` + `chartSignalMarkers` rewrite)

**Files:**
- Modify: `apps/web/src/App.tsx:1455-1508` (the `chartData` and `chartSignalMarkers` `useMemo`s)

**Interfaces:**
- Consumes: `AgentSignal.confidenceScore`, `AgentSignal.evidence.scoresContext.fieldPressureScore` (Task 1), existing `OddsSnapshot` type (`App.tsx:120-129`, has `id?: string`, `timestamp?: string`), existing `formatTime`, `signalTypeLabel`, `getSignalType`, `getSignalTarget` helpers (all already in scope), existing `oddsHistory` and `signals` state.
- Produces: a new module-level helper `findNearestSnapshot(history: OddsSnapshot[], targetTimestamp?: string): OddsSnapshot | undefined`. `chartData` keeps its existing field shape (`name`, `snapshotLabel`, `timelineLabel`, `rawTimestamp`, `home`, `draw`, `away`) — unchanged, so `chartReadout` (`App.tsx:1509+`, unmodified) keeps working. `chartSignalMarkers` items gain `severity?: string`, `confidenceScore?: number`, `fieldPressureScore?: number`, `explanation?: string` on top of their existing fields (`id`, `x`, `y`, `dataKey`, `label`, `target`, `oddsBefore`, `oddsAfter`, `oddsChangePct`, `trapStatus`, `reversalRisk`, `scoreRealityStatus`) — consumed by Task 3 (marker fill/radius) and Task 4 (tooltip).

- [ ] **Step 1: Add the `findNearestSnapshot` helper**

In `apps/web/src/App.tsx`, place this near the other standalone helper functions (e.g. directly above the `formatTime` function, or any other top-level helper — match existing file convention for where free functions live, outside the component body):

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

- [ ] **Step 2: Replace the `chartData` useMemo**

Find the current `chartData` definition (`App.tsx:1455-1475`):

```typescript
  const chartData = useMemo(
    () =>
      oddsHistory.slice(-18).map((snapshot, index) => {
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
      }),
    [oddsHistory]
  );
```

Replace with:

```typescript
  const chartData = useMemo(() => {
    const MAX_NON_SIGNAL_CHART_POINTS = 18;

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

- [ ] **Step 3: Replace the `chartSignalMarkers` useMemo**

Find the current `chartSignalMarkers` definition (`App.tsx:1476-1508`):

```typescript
  const chartSignalMarkers = useMemo(() => {
    if (!selectedMatch || chartData.length === 0) return [];

    const relatedSignals = signals.filter((signal) => signal.matchId === selectedMatch.id);

    return relatedSignals.slice(0, 3).map((signal, index) => {
      const side = (signal.side ?? "").toLowerCase();
      const dataKey = side === "away" ? "away" : "home";
      const fallbackPoint = chartData[Math.max(chartData.length - 1 - index * 3, 0)];

      const nearestPoint =
        chartData.find((point) => {
          if (!point.rawTimestamp || !signal.createdAt) return false;

          return formatTime(point.rawTimestamp) === formatTime(signal.createdAt);
        }) ?? fallbackPoint;

      return {
        id: signal.id ?? `${signal.matchId}-${index}`,
        x: nearestPoint.name,
        y: Number(signal.oddsAfter ?? nearestPoint[dataKey]),
        dataKey,
        label: signalTypeLabel(getSignalType(signal)),
        target: getSignalTarget(signal),
        oddsBefore: signal.oddsBefore,
        oddsAfter: signal.oddsAfter,
        oddsChangePct: signal.oddsChangePct,
        trapStatus: signal.trapStatus,
        reversalRisk: signal.reversalRisk,
        scoreRealityStatus: signal.scoreRealityStatus,
      };
    });
  }, [selectedMatch, chartData, signals]);
```

Replace with:

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

- [ ] **Step 4: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors. `findNearestSnapshot` is now used in two places (Step 2 and Step 3) in this same task, so no unused-declaration error. The new marker fields (`severity`, `confidenceScore`, `fieldPressureScore`, `explanation`) are object properties, not consumed by any render code yet — this compiles fine since `noUnusedLocals` doesn't flag unused object properties, only unused local variables/functions.

- [ ] **Step 5: Manual dev check**

Run `npm run dev` in `apps/web`, open the app, select a match with signal history. Confirm:
- The chart still renders and markers still appear at roughly the same positions as before.
- No console errors.

Stop the dev server after checking (see project convention: kill by exact PID, not by process-name pattern).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Fix odds chart signal-marker persistence with timestamp-proximity matching"
```

---

### Task 3: Severity-coded marker fill/radius and legend

**Files:**
- Modify: `apps/web/src/App.tsx` (add `severityMarkerStyle` helper near other helpers; modify the `ReferenceDot` render site at `App.tsx:2429-2445`; modify the legend at `App.tsx:2489-2492`)

**Interfaces:**
- Consumes: `marker.severity` from Task 2's `chartSignalMarkers`.
- Produces: `severityMarkerStyle(severity?: string): { fill: string; radius: number }`, used only within this task.

- [ ] **Step 1: Add the `severityMarkerStyle` helper**

Place it next to `findNearestSnapshot` (added in Task 2) or any other top-level helper:

```typescript
function severityMarkerStyle(severity?: string) {
  if (severity === "HIGH") return { fill: "#f87171", radius: 7 };
  if (severity === "MEDIUM") return { fill: "#fbbf24", radius: 5.5 };
  return { fill: "#94a3b8", radius: 4 };
}
```

- [ ] **Step 2: Update the `ReferenceDot` render site**

Find (`App.tsx:2429-2445`):

```tsx
                        {chartSignalMarkers.map((marker) => (
                          <ReferenceDot
                            key={marker.id}
                            x={marker.x}
                            y={marker.y}
                            r={5}
                            stroke="#fff7ed"
                            strokeWidth={2}
                            fill={marker.dataKey === "away" ? "#34d399" : "#fb923c"}
                            label={{
                              value: "Signal",
                              position: "top",
                              fill: "#fed7aa",
                              fontSize: 10,
                            }}
                          />
                        ))}
```

Replace with:

```tsx
                        {chartSignalMarkers.map((marker) => {
                          const markerStyle = severityMarkerStyle(marker.severity);

                          return (
                            <ReferenceDot
                              key={marker.id}
                              x={marker.x}
                              y={marker.y}
                              r={markerStyle.radius}
                              stroke="#fff7ed"
                              strokeWidth={2}
                              fill={markerStyle.fill}
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

- [ ] **Step 3: Update the legend**

Find (`App.tsx:2489-2492`):

```tsx
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full border border-orange-100 bg-orange-400" />
                        Signal detected here
                      </span>
```

Replace with:

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

- [ ] **Step 4: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors. `severityMarkerStyle` is defined and used within this same task (Step 1 defines it, Step 2 calls it).

- [ ] **Step 5: Manual dev check**

Run `npm run dev`, select a match with signal history of mixed severities if available. Confirm markers show distinct colors/sizes matching severity, and the legend shows three swatches. Stop the dev server after checking (exact PID, not pattern-kill).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Color/size-code odds chart signal markers by severity"
```

---

### Task 4: Tooltip enrichment (confidence, field pressure, reasoning)

**Files:**
- Modify: `apps/web/src/App.tsx:2387-2396` (the tooltip's marker-detail block)

**Interfaces:**
- Consumes: `marker.confidenceScore`, `marker.fieldPressureScore`, `marker.explanation` from Task 2's `chartSignalMarkers`; existing `formatOdds`, `formatOddsChange` helpers (already in scope, already used in this block).

- [ ] **Step 1: Add confidence/field-pressure/reasoning lines to the tooltip**

Find (`App.tsx:2387-2396`):

```tsx
                                {marker && (
                                  <div className="mt-2 rounded-xl border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-[11px] leading-5 text-orange-50/90">
                                    <p className="font-semibold text-orange-100">{marker.label}</p>
                                    <p>Target: {marker.target ?? "Tracked side"}</p>
                                    <p>
                                      Odds: {formatOdds(marker.oddsBefore)} → {formatOdds(marker.oddsAfter)}
                                    </p>
                                    <p>Move: {formatOddsChange(marker.oddsChangePct)}</p>
                                  </div>
                                )}
```

Replace with:

```tsx
                                {marker && (
                                  <div className="mt-2 rounded-xl border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-[11px] leading-5 text-orange-50/90">
                                    <p className="font-semibold text-orange-100">{marker.label}</p>
                                    <p>Target: {marker.target ?? "Tracked side"}</p>
                                    <p>
                                      Odds: {formatOdds(marker.oddsBefore)} → {formatOdds(marker.oddsAfter)}
                                    </p>
                                    <p>Move: {formatOddsChange(marker.oddsChangePct)}</p>
                                    <p>
                                      Confidence:{" "}
                                      {marker.confidenceScore != null ? `${marker.confidenceScore}%` : "—"}
                                    </p>
                                    <p>
                                      Field pressure:{" "}
                                      {marker.fieldPressureScore != null ? marker.fieldPressureScore : "—"}
                                    </p>
                                    {marker.explanation && (
                                      <p className="mt-1 text-orange-50/80">{marker.explanation}</p>
                                    )}
                                  </div>
                                )}
```

- [ ] **Step 2: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manual dev check**

Run `npm run dev`, select a match with signal history, hover over a signal marker's x-position on the chart. Confirm the tooltip shows Confidence, Field pressure, and (when present) the reasoning text below the existing Move line. Confirm hovering a non-signal point still shows the normal tooltip without the marker block. Stop the dev server after checking (exact PID, not pattern-kill).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Show confidence, field pressure, and reasoning in odds chart signal tooltip"
```

---

## Final Verification

After all four tasks:

- [ ] Run `npm run build` from `apps/web` one more time — full clean build.
- [ ] Run `npm run lint` from `apps/web` — no new lint errors.
- [ ] Manual end-to-end check in the dev browser: select a match, confirm markers are severity-colored/sized, tooltip shows all fields, and (if a live/replay stream is running long enough) a previously-marked point stays visible past 18+ subsequent ticks instead of disappearing.
- [ ] Report the full diff to the user for review — do not push until they explicitly say to.
