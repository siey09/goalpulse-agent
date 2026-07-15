# Live Markets Operator Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Live Markets into a dense operator cockpit that connects fixture selection, current Home/Draw/Away prices, odds movement, signal evidence, and feed trust in the first desktop viewport.

**Architecture:** Keep `App.tsx` as the sole owner of live data, selection, replay, polling, and SSE state. Replace the stacked page composition with four focused presentation units: a single-status toolbar, a bounded fixture rail, a selected-market summary, and a dominant chart followed by a compact evidence strip. Preserve existing callbacks and guided-tour IDs while moving only presentation-derived logic into the feature components.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, Recharts 3, Lucide React, Vitest 4, Testing Library.

## Global Constraints

- Preserve current backend contracts, polling and SSE behavior, replay behavior, signal selection flow, fixture filters, analytics-only positioning, and guided-tour targets.
- At 1440 px, the fixture rail, selected identity/current prices, verdict, and chart must be visible in the first viewport under the global app chrome.
- Render Home, Draw, and Away chart series only when the existing data contains those values; never invent missing prices.
- Feed state must have one authoritative visible status and must distinguish live, connecting, stale, replay, and waiting truthfully.
- Preserve stable series colors: Home amber, Draw proof violet, Away teal.
- Do not add dependencies, backend endpoints, providers, market types, scoring logic, thresholds, or betting execution language.
- No horizontal page overflow from 320 px upward; primary mobile actions must be at least 44 px high.
- Respect visible keyboard focus, reduced motion, semantic status, and WCAG AA contrast.
- Full web tests, lint, TypeScript build, Vite production build, browser verification, and independent review must pass before publication.

---

## File structure

- Create `apps/web/src/features/markets/LiveMarketToolbar.tsx`: the single authoritative feed/replay state and dropped-update notice.
- Create `apps/web/src/features/markets/LiveMarketToolbar.test.tsx`: state-label and replay-action coverage.
- Create `apps/web/src/features/markets/MarketFixtureRail.tsx`: filterable, bounded fixture selection rail.
- Create `apps/web/src/features/markets/MarketFixtureRail.test.tsx`: ordering, filtering, selection, and empty-state coverage.
- Create `apps/web/src/features/markets/SelectedMarketWorkspace.tsx`: selected fixture identity, score, current H/D/A prices, verdict, and signal pressure.
- Create `apps/web/src/features/markets/SelectedMarketWorkspace.test.tsx`: current-price, state, and no-data behavior.
- Create `apps/web/src/features/markets/MarketEvidenceStrip.tsx`: field context, outcome audit, snapshot coverage, and feed evidence.
- Create `apps/web/src/features/markets/MarketEvidenceStrip.test.tsx`: semantic evidence labels and zero-denominator behavior.
- Modify `apps/web/src/features/markets/OddsMovementChart.tsx`: chart-only responsibility, conditional Draw series, accessible data table, accessible signal actions, reduced decorative copy.
- Create `apps/web/src/features/markets/OddsMovementChart.test.tsx`: Draw inclusion/omission, accessible chart data, signal action, and empty state.
- Modify `apps/web/src/features/markets/LiveMarketsPage.tsx`: cockpit composition and shared presentation types.
- Modify `apps/web/src/features/markets/LiveMarketsPage.smoke.test.tsx`: full-page workflow and degraded-state coverage.
- Delete `apps/web/src/features/markets/SelectedMatchPanel.tsx`, `apps/web/src/features/markets/IntelligenceRail.tsx`, and `apps/web/src/features/markets/MarketBoard.tsx` after their responsibilities are replaced.
- Modify `apps/web/src/app/guideSteps.ts`: keep existing target IDs but align copy with the new fixture rail and selected workspace.
- Preserve `apps/web/src/App.tsx` unchanged by retaining the current `LiveMarketsPageProps` names and callback signatures.

### Task 1: Build the bounded fixture selection rail

**Files:**
- Create: `apps/web/src/features/markets/MarketFixtureRail.tsx`
- Create: `apps/web/src/features/markets/MarketFixtureRail.test.tsx`
- Reference: `apps/web/src/features/markets/MarketBoard.tsx`

**Interfaces:**
- Consumes: `Match[]`, `MatchStatusFilter`, status counts, selected match ID, `onChangeMatchStatusFilter`, and `onSelectMatch`.
- Produces: `MarketFixtureRail` with the existing `guide-market-board` target and no page-level scrolling dependency.

- [ ] **Step 1: Write failing fixture-rail tests**

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketFixtureRail } from "./MarketFixtureRail";
import type { Match } from "../../types";

const matches: Match[] = [
  { id: "finished", homeTeam: "Japan", awayTeam: "Spain", status: "finished", homeScore: 1, awayScore: 2 },
  { id: "live", homeTeam: "Norway", awayTeam: "England", status: "live", minute: 67, homeScore: 1, awayScore: 0 },
  { id: "scheduled", homeTeam: "Brazil", awayTeam: "France", status: "scheduled" },
];

it("orders live fixtures first in All and selects a fixture", () => {
  const onSelectMatch = vi.fn();
  render(
    <MarketFixtureRail
      matches={matches}
      matchStatusFilter="all"
      onChangeMatchStatusFilter={vi.fn()}
      matchStatusCounts={{ all: 3, live: 1, scheduled: 1, finished: 1 }}
      selectedMatchId="finished"
      onSelectMatch={onSelectMatch}
    />
  );
  const fixtureButtons = screen.getAllByRole("button", { name: /inspect market/i });
  expect(fixtureButtons[0]).toHaveAccessibleName(/Norway vs England/i);
  fireEvent.click(fixtureButtons[0]);
  expect(onSelectMatch).toHaveBeenCalledWith("live");
});

it("changes filters and offers a return to All from an empty filter", () => {
  const onChange = vi.fn();
  render(
    <MarketFixtureRail
      matches={[]}
      matchStatusFilter="live"
      onChangeMatchStatusFilter={onChange}
      matchStatusCounts={{ all: 2, live: 0, scheduled: 2, finished: 0 }}
      selectedMatchId=""
      onSelectMatch={vi.fn()}
    />
  );
  expect(screen.getByText(/no live fixtures/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /show all fixtures/i }));
  expect(onChange).toHaveBeenCalledWith("all");
  expect(within(screen.getByRole("region", { name: /fixture rail/i })).getByText("Live")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the fixture-rail test and verify RED**

Run: `npm.cmd test -- src/features/markets/MarketFixtureRail.test.tsx --maxWorkers=1`

Expected: FAIL because `./MarketFixtureRail` does not exist.

- [ ] **Step 3: Implement the minimal rail**

Create the existing filter type and prop contract, preserve `preciseStatusLabel`, `matchClockLabel`, and `dataFreshnessLabel`, and use a compact button row per fixture:

```tsx
export type MatchStatusFilter = "all" | "live" | "scheduled" | "finished";

export function MarketFixtureRail(props: MarketFixtureRailProps) {
  const displayMatches =
    props.matchStatusFilter === "all"
      ? [...props.matches].sort((a, b) => (STATUS_SCAN_ORDER[a.status ?? ""] ?? 3) - (STATUS_SCAN_ORDER[b.status ?? ""] ?? 3))
      : props.matches;

  return (
    <section id="guide-market-board" role="region" aria-label="Fixture rail" className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface-1">
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500">Market feed</p>
            <h2 className="font-display text-lg font-bold text-white">Fixtures</h2>
          </div>
          <span aria-live="polite" className="font-mono text-xs tabular-nums text-stone-300">{displayMatches.length} shown</span>
        </div>
        <SegmentedToggle options={FILTER_OPTIONS.map((option) => ({ ...option, count: props.matchStatusCounts[option.value] }))} value={props.matchStatusFilter ?? "all"} onChange={props.onChangeMatchStatusFilter} />
      </div>
      {displayMatches.length === 0 ? (
        <EmptyState
          reason={`No ${props.matchStatusFilter === "scheduled" ? "upcoming" : props.matchStatusFilter} fixtures are available.`}
          action={<button type="button" onClick={() => props.onChangeMatchStatusFilter("all")} className="min-h-11 rounded-lg px-3 text-xs font-semibold text-accent-100">Show all fixtures</button>}
        />
      ) : (
        <div className="max-h-[42rem] overflow-y-auto overscroll-contain p-2">
          {displayMatches.map((match) => (
            <button
              key={match.id}
              type="button"
              aria-label={`Inspect market for ${match.homeTeam ?? "home"} vs ${match.awayTeam ?? "away"}`}
              aria-pressed={props.selectedMatchId === match.id}
              onClick={() => props.onSelectMatch(match.id)}
              className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-2 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <StatusBadge label={preciseStatusLabel(match)} tone={matchStatusToTone(match)} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{match.homeTeam} vs {match.awayTeam}</span>
                <span className="block truncate text-[10px] text-stone-500">{dataFreshnessLabel(match.lastUpdated)}</span>
              </span>
              <span className="text-right font-mono text-xs tabular-nums text-stone-300">
                <span className="block">{match.status === "scheduled" ? matchClockLabel(match) : `${match.homeScore ?? 0}–${match.awayScore ?? 0}`}</span>
                {match.status === "live" && match.minute != null && <span className="block text-positive-200">{match.minute}'</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
```

Fill the fixture row with the current truthful formatters. Do not add odds columns because `Match` does not own snapshot odds.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm.cmd test -- src/features/markets/MarketFixtureRail.test.tsx --maxWorkers=1`

Expected: 2 tests pass with no React accessibility warnings.

- [ ] **Step 5: Commit the fixture rail**

```bash
git add apps/web/src/features/markets/MarketFixtureRail.tsx apps/web/src/features/markets/MarketFixtureRail.test.tsx
git commit -m "feat(live-markets): add fixture selection rail"
```

### Task 2: Build the selected-market tape and verdict

**Files:**
- Create: `apps/web/src/features/markets/SelectedMarketWorkspace.tsx`
- Create: `apps/web/src/features/markets/SelectedMarketWorkspace.test.tsx`
- Reference: `apps/web/src/features/markets/SelectedMatchPanel.tsx`
- Reference: `apps/web/src/features/markets/OddsMovementChart.tsx`

**Interfaces:**
- Consumes: `selectedMatch`, `chartData`, `chartReadout`, `selectedMatchMarketPressure`, and the current market phase.
- Produces: `SelectedMarketWorkspace`, retaining `guide-selected-match`, that owns current price ticks and the single visible verdict.

- [ ] **Step 1: Write failing selected-workspace tests**

```tsx
const selectedMatch: Match = { id: "m1", homeTeam: "Norway", awayTeam: "England", status: "live", minute: 67, homeScore: 1, awayScore: 0 };
const baseProps: SelectedMarketWorkspaceProps = {
  selectedMatch,
  chartData: [{ name: "S1", home: 1.9, draw: 3.5, away: 4.1 }, { name: "S2", home: 1.85, draw: 3.4, away: 4.2 }],
  chartReadout: {
    homeCurrent: "1.85", drawCurrent: "3.40", awayCurrent: "4.20",
    verdict: "Market steady", meaning: "No material move yet.", signalStatus: "No signal marker on this chart yet",
    severity: { tier: "Watch", cardClass: "border-white/10 bg-black/20", textClass: "text-stone-300", dotClass: "bg-stone-400", badgeClass: "border-white/10 text-stone-300" },
  },
  selectedMatchMarketPressure: { homePressure: 62, awayPressure: 38, leader: "Norway", hasData: true },
  isReplayStreamMode: false,
};

it("connects fixture identity, score, H/D/A prices, and verdict", () => {
  render(<SelectedMarketWorkspace {...baseProps} />);
  const workspace = screen.getByRole("region", { name: /selected market/i });
  expect(within(workspace).getByText("Norway vs England")).toBeInTheDocument();
  expect(within(workspace).getByLabelText(/score/i)).toHaveTextContent("1–0");
  expect(within(workspace).getByText("1.85")).toBeInTheDocument();
  expect(within(workspace).getByText("3.40")).toBeInTheDocument();
  expect(within(workspace).getByText("4.20")).toBeInTheDocument();
  expect(within(workspace).getByText("Market steady")).toBeInTheDocument();
});

it("does not invent pressure when no selected-match signal exists", () => {
  render(<SelectedMarketWorkspace {...baseProps} selectedMatchMarketPressure={{ homePressure: 0, awayPressure: 0, leader: "Balanced", hasData: false }} />);
  expect(screen.getByText(/waiting for a selected-match signal/i)).toBeInTheDocument();
  expect(screen.queryByText(/0% pressure/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the selected-workspace test and verify RED**

Run: `npm.cmd test -- src/features/markets/SelectedMarketWorkspace.test.tsx --maxWorkers=1`

Expected: FAIL because `SelectedMarketWorkspace` does not exist.

- [ ] **Step 3: Implement the selected-market tape**

Move `tickDirection` and `TickIndicator` from `OddsMovementChart.tsx` into the new component. Use a quiet, connected layout instead of nested cards:

```tsx
const isLive = selectedMatch?.status === "live";
const isScheduled = selectedMatch?.status === "scheduled";
const matchLabel = selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "No match selected";
const scoreLabel = isScheduled ? "Scheduled" : `${selectedMatch?.homeScore ?? 0}–${selectedMatch?.awayScore ?? 0}`;
const marketContextLabel = isReplayStreamMode
  ? "Demo replay"
  : isScheduled
    ? "Pre-match odds"
    : isLive
      ? `Live · ${matchClockLabel(selectedMatch)}`
      : selectedMatch?.status === "finished"
        ? "Finished audit"
        : "Waiting";
const statusTone: StatusTone = isLive ? "positive" : isScheduled ? "info" : "neutral";
const priceCells = [
  { key: "home" as const, label: selectedMatch?.homeTeam ?? "Home", value: chartReadout.homeCurrent, tone: "text-accent-200", direction: tickDirection(chartData, "home") },
  { key: "draw" as const, label: "Draw", value: chartReadout.drawCurrent, tone: "text-proof-200", direction: tickDirection(chartData, "draw") },
  { key: "away" as const, label: selectedMatch?.awayTeam ?? "Away", value: chartReadout.awayCurrent, tone: "text-positive-200", direction: tickDirection(chartData, "away") },
];

function PriceCell({ label, value, tone, direction }: { label: string; value: string; tone: string; direction?: TickDirection }) {
  return <div className="min-w-0 px-3 py-2"><p className="truncate text-[10px] uppercase tracking-widest text-stone-500">{label}</p><div className="mt-1 flex items-center gap-1"><span className={`font-mono text-lg font-bold tabular-nums ${tone}`}>{value}</span><TickIndicator direction={direction ?? null} /></div></div>;
}

<section id="guide-selected-match" role="region" aria-label="Selected market" className="border-b border-border bg-black/15">
  <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.8fr)] lg:items-center">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={preciseStatusLabel(selectedMatch)} tone={statusTone} />
        <span className="font-mono text-xs text-stone-400">{marketContextLabel}</span>
      </div>
      <h2 className="mt-2 truncate font-display text-xl font-bold text-white">{matchLabel}</h2>
      <p aria-label="Score" className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">{scoreLabel}</p>
    </div>
    <div aria-label="Current decimal odds" className="grid grid-cols-3 divide-x divide-border border-y border-border">
      {priceCells.map((cell) => <PriceCell key={cell.key} {...cell} />)}
    </div>
  </div>
  <div className={`grid gap-3 border-t p-3 sm:grid-cols-[minmax(0,1fr)_auto] ${chartReadout.severity.cardClass}`}>
    <div><p className="text-[10px] uppercase tracking-widest text-stone-400">Market verdict</p><h3 className="text-base font-bold text-white">{chartReadout.verdict}</h3><p className="text-xs text-stone-300">{chartReadout.meaning}</p></div>
    <span className={chartReadout.severity.badgeClass}>{chartReadout.severity.tier}</span>
  </div>
</section>
```

Show pressure as a compact two-segment comparison only when `hasData` is true; otherwise show the honest waiting copy from the test.

- [ ] **Step 4: Run the selected-workspace test and verify GREEN**

Run: `npm.cmd test -- src/features/markets/SelectedMarketWorkspace.test.tsx --maxWorkers=1`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the selected workspace**

```bash
git add apps/web/src/features/markets/SelectedMarketWorkspace.tsx apps/web/src/features/markets/SelectedMarketWorkspace.test.tsx
git commit -m "feat(live-markets): connect selected market and prices"
```

### Task 3: Make the odds chart complete and accessible

**Files:**
- Modify: `apps/web/src/features/markets/OddsMovementChart.tsx`
- Create: `apps/web/src/features/markets/OddsMovementChart.test.tsx`

**Interfaces:**
- Consumes: `selectedMatch`, `chartData`, `chartSignalMarkers`, `onSelectSignalId`, and replay/live context.
- Produces: one dominant chart with optional Draw series, a nonvisual data table, and visible signal inspect controls.

- [ ] **Step 1: Write failing chart tests**

```tsx
const selectedMatch: Match = { id: "m1", homeTeam: "Norway", awayTeam: "England", status: "live", homeScore: 1, awayScore: 0 };
const marker: LiveMarketsChartMarker = { id: "signal-1", x: "S1", y: 1.85, label: "Sharp move", target: "Norway", severity: "HIGH", oddsChangePct: -7.5 };
const baseProps: OddsMovementChartProps = {
  selectedMatch,
  chartData: [{ name: "S1", home: 1.9, draw: 3.4, away: 4.1, snapshotLabel: "TxLINE snapshot 1", timelineLabel: "Captured at 11:10 PM" }],
  chartSignalMarkers: [],
  onSelectSignalId: vi.fn(),
  isReplayStreamMode: false,
  isOddsStreamLive: true,
  streamProgressPercent: 100,
};

it("includes Draw in the accessible series summary only when real draw data exists", () => {
  const { rerender } = render(<OddsMovementChart {...baseProps} chartData={[{ name: "S1", home: 1.9, draw: 3.4, away: 4.1 }]} />);
  expect(screen.getByRole("columnheader", { name: "Draw odds" })).toBeInTheDocument();
  rerender(<OddsMovementChart {...baseProps} chartData={[{ name: "S1", home: 1.9, away: 4.1 }]} />);
  expect(screen.queryByRole("columnheader", { name: "Draw odds" })).not.toBeInTheDocument();
});

it("offers a keyboard-accessible inspect action for every signal marker", () => {
  const onSelectSignalId = vi.fn();
  render(<OddsMovementChart {...baseProps} chartSignalMarkers={[marker]} onSelectSignalId={onSelectSignalId} />);
  fireEvent.click(screen.getByRole("button", { name: /inspect signal.*sharp move/i }));
  expect(onSelectSignalId).toHaveBeenCalledWith(marker.id);
});

it("names the chart and explains snapshot semantics", () => {
  render(<OddsMovementChart {...baseProps} />);
  expect(screen.getByRole("img", { name: /odds movement for Norway vs England/i })).toHaveAccessibleDescription(/TxLINE snapshot/i);
});

it("keeps the selected-fixture context when no snapshots exist", () => {
  render(<OddsMovementChart {...baseProps} chartData={[]} />);
  expect(screen.getByText(/no TxLINE snapshots for Norway vs England yet/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run chart tests and verify RED**

Run: `npm.cmd test -- src/features/markets/OddsMovementChart.test.tsx --maxWorkers=1`

Expected: FAIL because the current chart has no accessible table, chart description, or signal buttons.

- [ ] **Step 3: Remove price/verdict ownership from the chart**

Delete the current H/D/A price strip and verdict block from `OddsMovementChart`; Task 2 now owns them. Keep only chart title, phase context, visualization, signal actions, progress, and concise legend.

- [ ] **Step 4: Add conditional series and accessible data**

```tsx
const hasHomeSeries = chartData.some((point) => point.home != null);
const hasDrawSeries = chartData.some((point) => point.draw != null);
const hasAwaySeries = chartData.some((point) => point.away != null);
const chartDescriptionId = "live-market-chart-description";
const matchLabel = selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "selected market";

<div role="img" aria-label={`Odds movement for ${matchLabel}`} aria-describedby={chartDescriptionId}>
  <p id={chartDescriptionId} className="sr-only">Each point is a real TxLINE snapshot. Lower decimal odds indicate stronger market favor.</p>
  <ResponsiveContainer width="100%" height="100%">
```

Keep the existing `AreaChart`, axes, inline Tooltip callback, Home/Away areas, and ReferenceDot mapping inside that container. Wrap the Home and Away `<Area>` elements in `hasHomeSeries` and `hasAwaySeries` conditions, respectively, and render their legend entries only under the same conditions. Then replace the current container closing with:

```tsx
  </ResponsiveContainer>
</div>
```

Insert this exact series immediately between the existing Home and Away `<Area>` elements:

```tsx
{hasDrawSeries && (
  <Area type="monotone" dataKey="draw" stroke="#a78bfa" strokeWidth={2} fillOpacity={0} dot={false} isAnimationActive={false} name="Draw odds" />
)}
```

Insert this exact row between the Home and Away rows in the inline Tooltip callback:

```tsx
{point.draw != null && (
  <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
    <span className="text-stone-400">Draw</span>
    <span className="font-mono font-semibold text-proof-200">{formatOdds(point.draw)}</span>
  </div>
)}
```

Add the nonvisual table after the chart wrapper:

```tsx
<table className="sr-only">
  <caption>Odds movement data for {matchLabel}</caption>
  <thead><tr><th>Snapshot</th>{hasHomeSeries && <th>Home odds</th>}{hasDrawSeries && <th>Draw odds</th>}{hasAwaySeries && <th>Away odds</th>}</tr></thead>
  <tbody>{chartData.map((point) => <tr key={`${point.name}-${point.timelineLabel}`}><th>{point.timelineLabel ?? point.name}</th>{hasHomeSeries && <td>{formatOdds(point.home)}</td>}{hasDrawSeries && <td>{formatOdds(point.draw)}</td>}{hasAwaySeries && <td>{formatOdds(point.away)}</td>}</tr>)}</tbody>
</table>
```

Use proof violet for Draw in the legend and tooltip. Add Draw to the tooltip only when the point contains it.

When `chartData` is empty, replace the visualization wrapper with a compact status panel that says `No TxLINE snapshots for ${matchLabel} yet.` Keep the selected-market summary above it visible; do not tell the user to select a market when one is already selected.

- [ ] **Step 5: Add the visible signal action list**

Below the chart, render one minimum-44-px button per marker with severity, label, target, movement, and explicit `Inspect signal` copy. Keep chart dots for visual correlation, but do not depend on them for keyboard access.

- [ ] **Step 6: Run chart tests and verify GREEN**

Run: `npm.cmd test -- src/features/markets/OddsMovementChart.test.tsx --maxWorkers=1`

Expected: 4 tests pass.

- [ ] **Step 7: Commit chart completeness**

```bash
git add apps/web/src/features/markets/OddsMovementChart.tsx apps/web/src/features/markets/OddsMovementChart.test.tsx
git commit -m "feat(live-markets): complete and label odds chart"
```

### Task 4: Create the single-status toolbar and evidence strip

**Files:**
- Create: `apps/web/src/features/markets/LiveMarketToolbar.tsx`
- Create: `apps/web/src/features/markets/LiveMarketToolbar.test.tsx`
- Create: `apps/web/src/features/markets/MarketEvidenceStrip.tsx`
- Create: `apps/web/src/features/markets/MarketEvidenceStrip.test.tsx`
- Modify: `apps/web/src/features/markets/freshness.ts`

**Interfaces:**
- `LiveMarketToolbar` consumes `hasChartData`, replay/live state, last update, replay progress, dropped-update state, and the replay callback.
- `MarketEvidenceStrip` consumes chart snapshot count, health, correct/closed counts, field context, and selected-fixture signal state.
- Later composition relies on the toolbar being the only visible freshness label.

- [ ] **Step 1: Write failing toolbar tests**

```tsx
const baseToolbarProps: LiveMarketToolbarProps = {
  hasChartData: true,
  isReplayStreamMode: false,
  onToggleReplayStreamMode: vi.fn(),
  isOddsStreamLive: false,
  oddsStreamLastUpdate: undefined,
  replayStreamProgress: undefined,
  hasDroppedUpdate: false,
};

it.each([
  [{ hasChartData: false, isReplayStreamMode: false, isOddsStreamLive: false }, "Waiting"],
  [{ hasChartData: true, isReplayStreamMode: true, isOddsStreamLive: false }, "Replay"],
  [{ hasChartData: true, isReplayStreamMode: false, isOddsStreamLive: true }, "Live"],
  [{ hasChartData: true, isReplayStreamMode: false, isOddsStreamLive: false, oddsStreamLastUpdate: "11:12 PM" }, "Stale"],
])("renders the truthful authoritative state", (state, label) => {
  render(<LiveMarketToolbar {...baseToolbarProps} {...state} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});

it("exposes replay and dropped-update actions without raw payloads", () => {
  const onToggle = vi.fn();
  render(<LiveMarketToolbar {...baseToolbarProps} hasDroppedUpdate onToggleReplayStreamMode={onToggle} />);
  expect(screen.getByRole("status")).toHaveTextContent(/one update was skipped/i);
  fireEvent.click(screen.getByRole("button", { name: /start demo replay/i }));
  expect(onToggle).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Write failing evidence-strip tests**

```tsx
it("labels the audit denominator and never renders NaN", () => {
  render(<MarketEvidenceStrip chartDataCount={0} correctSignals={0} closedSignals={0} health={null} fieldContext={{ label: "No field context yet", tone: "neutral" }} signalCount={0} />);
  expect(screen.getByText("0 / 0")).toBeInTheDocument();
  expect(screen.getByText(/confirmed vs closed/i)).toBeInTheDocument();
  expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run both tests and verify RED**

Run: `npm.cmd test -- src/features/markets/LiveMarketToolbar.test.tsx src/features/markets/MarketEvidenceStrip.test.tsx --maxWorkers=1`

Expected: FAIL because both components are missing.

- [ ] **Step 4: Implement the toolbar**

Call `getFreshnessState` once and render one state badge. Define these values before the return:

```tsx
const freshnessState = getFreshnessState(hasChartData, isReplayStreamMode, isOddsStreamLive, oddsStreamLastUpdate);
const freshness = FRESHNESS_COPY[freshnessState];
```

The toolbar must include the page heading, concise purpose, last tick, dropped-update status, and replay button:

```tsx
<header className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-end lg:justify-between">
  <div><p className="font-mono text-[10px] uppercase tracking-widest text-info-200">Operations / market feed</p><h1 className="font-display text-2xl font-bold text-white">Live Markets</h1><p className="mt-1 text-sm text-stone-400">Select a fixture, inspect real TxLINE movement, and open the evidence behind a signal.</p></div>
  <div className="flex flex-wrap items-center gap-2">
    <span className={`min-h-11 rounded-lg border px-3 py-2 font-mono text-xs font-semibold ${freshness.toneClass}`}>{freshness.label}</span>
    {oddsStreamLastUpdate && <span className="font-mono text-xs text-stone-400">Last tick {oddsStreamLastUpdate}</span>}
    <button type="button" onClick={onToggleReplayStreamMode} className="min-h-11 rounded-lg border border-border px-3 text-xs font-semibold text-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
      {isReplayStreamMode ? "Stop demo replay" : "Start demo replay"}
    </button>
  </div>
  {hasDroppedUpdate && <p role="status" className="basis-full text-xs text-warning-200">One update was skipped because it could not be parsed. Prior data remains visible.</p>}
</header>
```

- [ ] **Step 5: Implement the evidence strip**

Use one semantic `section` with four aligned evidence cells and hairline separators, not nested cards. Values: snapshot count, field context, outcome audit, and feed/event coverage. Use `health?.liveStream?.totalEventsReceived` only when connected; otherwise label coverage unavailable.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm.cmd test -- src/features/markets/LiveMarketToolbar.test.tsx src/features/markets/MarketEvidenceStrip.test.tsx --maxWorkers=1`

Expected: all toolbar and evidence tests pass.

- [ ] **Step 7: Commit trust surfaces**

```bash
git add apps/web/src/features/markets/LiveMarketToolbar.tsx apps/web/src/features/markets/LiveMarketToolbar.test.tsx apps/web/src/features/markets/MarketEvidenceStrip.tsx apps/web/src/features/markets/MarketEvidenceStrip.test.tsx apps/web/src/features/markets/freshness.ts
git commit -m "feat(live-markets): unify feed and evidence state"
```

### Task 5: Compose the operator cockpit and remove the stacked components

**Files:**
- Modify: `apps/web/src/features/markets/LiveMarketsPage.tsx`
- Modify: `apps/web/src/features/markets/LiveMarketsPage.smoke.test.tsx`
- Delete: `apps/web/src/features/markets/SelectedMatchPanel.tsx`
- Delete: `apps/web/src/features/markets/IntelligenceRail.tsx`
- Delete: `apps/web/src/features/markets/MarketBoard.tsx`
- Preserve: `apps/web/src/App.tsx` (no prop-contract or data-ownership changes)

**Interfaces:**
- Consumes all components produced by Tasks 1–4.
- Produces the final responsive page while preserving the public `LiveMarketsPageProps` data and callback contract.

- [ ] **Step 1: Replace the smoke fixture with workflow-focused tests**

Add assertions for:

```tsx
it("renders one heading and connects the fixture rail to the selected workspace", () => {
  render(<LiveMarketsPage {...baseProps} />);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("region", { name: /fixture rail/i })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: /selected market/i })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /odds movement/i })).toBeInTheDocument();
});

it("renders feed state once", () => {
  render(<LiveMarketsPage {...baseProps} isOddsStreamLive />);
  expect(screen.getAllByText("Live")).toHaveLength(1);
});

it("keeps selected identity visible when snapshots are empty", () => {
  render(<LiveMarketsPage {...baseProps} chartData={[]} />);
  expect(screen.getByText("Norway vs England")).toBeInTheDocument();
  expect(screen.getByText(/no TxLINE snapshots for this fixture yet/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the page test and verify RED**

Run: `npm.cmd test -- src/features/markets/LiveMarketsPage.smoke.test.tsx --maxWorkers=1`

Expected: FAIL because the current page has no page heading/cockpit regions and repeats live status.

- [ ] **Step 3: Compose the page**

```tsx
export function LiveMarketsPage(props: LiveMarketsPageProps) {
  return (
    <div className="min-w-0 space-y-4">
      <LiveMarketToolbar
        hasChartData={props.chartData.length > 0}
        isReplayStreamMode={props.isReplayStreamMode}
        onToggleReplayStreamMode={props.onToggleReplayStreamMode}
        isOddsStreamLive={props.isOddsStreamLive}
        oddsStreamLastUpdate={props.oddsStreamLastUpdate}
        replayStreamProgress={props.replayStreamProgress}
        hasDroppedUpdate={props.hasDroppedUpdate}
      />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(18rem,0.38fr)_minmax(0,1fr)] xl:items-start">
        <MarketFixtureRail
          matches={props.matches}
          matchStatusFilter={props.matchStatusFilter}
          onChangeMatchStatusFilter={props.onChangeMatchStatusFilter}
          matchStatusCounts={props.matchStatusCounts}
          selectedMatchId={props.selectedMatchId}
          onSelectMatch={props.onSelectMatch}
        />
        <section aria-label="Selected market workspace" className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface-1">
          <SelectedMarketWorkspace
            selectedMatch={props.selectedMatch}
            chartData={props.chartData}
            chartReadout={props.chartReadout}
            selectedMatchMarketPressure={props.selectedMatchMarketPressure}
            isReplayStreamMode={props.isReplayStreamMode}
          />
          <OddsMovementChart
            selectedMatch={props.selectedMatch}
            chartData={props.chartData}
            chartSignalMarkers={props.chartSignalMarkers}
            onSelectSignalId={props.onSelectSignalId}
            isReplayStreamMode={props.isReplayStreamMode}
            isOddsStreamLive={props.isOddsStreamLive}
            streamProgressPercent={props.streamProgressPercent}
            replayStreamProgress={props.replayStreamProgress}
          />
          <MarketEvidenceStrip
            chartDataCount={props.chartData.length}
            health={props.health}
            correctSignals={props.correctSignals}
            closedSignals={props.closedSignals}
            fieldContext={props.fieldContext}
            signalCount={props.chartSignalMarkers.length}
          />
        </section>
      </div>
    </div>
  );
}
```

Keep `id="guide-selected-match"`, `id="guide-odds-chart"`, and `id="guide-market-board"` on their new owners. Ensure there is no duplicate visible freshness badge in the selected workspace, chart, or evidence strip.

- [ ] **Step 4: Remove superseded files and imports**

Delete the three old stacked components only after the new page compiles. Update imports in `LiveMarketsPage.tsx`. Retain every existing public prop name so `App.tsx` remains unchanged.

- [ ] **Step 5: Run focused and full tests**

Run: `npm.cmd test -- src/features/markets --maxWorkers=1`

Expected: all market feature tests pass.

Run: `npm.cmd test -- --maxWorkers=1`

Expected: all web test files pass with zero failures.

- [ ] **Step 6: Commit the cockpit composition**

```bash
git add apps/web/src/features/markets
git commit -m "feat(live-markets): compose operator cockpit"
```

### Task 6: Align the product tour and complete responsive verification

**Files:**
- Modify: `apps/web/src/app/guideSteps.ts`
- Create: `apps/web/src/app/guideSteps.test.ts`
- Modify: `apps/web/src/features/markets/LiveMarketToolbar.tsx`
- Modify: `apps/web/src/features/markets/MarketFixtureRail.tsx`
- Modify: `apps/web/src/features/markets/SelectedMarketWorkspace.tsx`
- Modify: `apps/web/src/features/markets/OddsMovementChart.tsx`
- Modify: `apps/web/src/features/markets/MarketEvidenceStrip.tsx`
- Modify: `apps/web/src/features/markets/LiveMarketsPage.tsx`
- Test: `apps/web/src/app/app.smoke.test.tsx`

**Interfaces:**
- Consumes the stable guide IDs from Task 5.
- Produces judge-facing tour copy and a verified desktop/tablet/mobile experience.

- [ ] **Step 1: Write failing guide-copy and target regression tests**

In `guideSteps.test.ts`, assert the static tour contract directly so the test does not depend on which single tour step is currently visible:

```tsx
import { describe, expect, it } from "vitest";
import { GUIDE_STEPS } from "./guideSteps";

it("keeps the Live Markets targets and judge-facing copy aligned", () => {
  const marketSteps = GUIDE_STEPS.filter((step) => step.destination === "live-markets");
  expect(marketSteps.map((step) => step.targetId)).toEqual(
    expect.arrayContaining(["guide-market-board", "guide-selected-match", "guide-odds-chart"])
  );
  expect(marketSteps.map((step) => step.title)).toEqual(
    expect.arrayContaining(["Choose a live market", "Inspect match state and price pressure"])
  );
});
```

In `app.smoke.test.tsx`, navigate to Live Markets and assert that all three targets resolve in the rendered page:

```tsx
expect(document.getElementById("guide-market-board")).not.toBeNull();
expect(document.getElementById("guide-selected-match")).not.toBeNull();
expect(document.getElementById("guide-odds-chart")).not.toBeNull();
```

- [ ] **Step 2: Run the guide test and verify its result**

Run: `npm.cmd test -- src/app/guideSteps.test.ts src/app/app.smoke.test.tsx --maxWorkers=1`

Expected: the target assertions pass, while the guide-copy assertion fails because the existing titles are "Compare normalized markets" and "Inspect match state and pressure".

- [ ] **Step 3: Update guide copy without changing step count**

Use exact truthful copy:

```ts
{
  title: "Choose a live market",
  detail: "The fixture rail keeps live, upcoming, and finished matches beside the selected workspace so every selection immediately updates the current prices and movement chart.",
  destination: "live-markets",
  targetId: "guide-market-board",
},
{
  title: "Inspect match state and price pressure",
  detail: "The selected-market tape connects the exact score and status to current Home, Draw, and Away prices and only shows signal pressure when matching evidence exists.",
  destination: "live-markets",
  targetId: "guide-selected-match",
},
```

- [ ] **Step 4: Run automated quality gates**

Run: `npm.cmd test -- --maxWorkers=1`

Expected: all tests pass.

Run: `npm.cmd run lint`

Expected: exit 0 with no errors.

Run: `npm.cmd run build`

Expected: TypeScript and Vite build exit 0. The existing main-chunk advisory may remain, but no new build error or dependency is allowed.

Run: `git diff --check origin/main...HEAD`

Expected: no whitespace errors.

- [ ] **Step 5: Start the bounded local fixture feed and frontend**

Use the repository's existing local API or fixture mechanism; do not add production mocks. Start the web dev server with an approved workspace runtime and record its URL.

- [ ] **Step 6: Verify in a real browser**

At 1440, 1024, 768, 390, and 320 px verify:

- No page-level horizontal overflow.
- At 1440 px, fixture rail, selected match/current prices, verdict, and chart appear in the first viewport.
- All, Live, Upcoming, and Finished filters work and counts remain truthful.
- Selecting fixtures updates identity, score, prices, chart, and signals.
- Draw line appears only where draw snapshots exist.
- Replay labeling never looks live.
- Stale, connecting, waiting, dropped-update, no-fixture, empty-filter, and no-snapshot states remain useful.
- Signal inspect buttons open the existing signal detail flow.
- Keyboard focus is visible and follows toolbar → fixtures → chart actions.
- Primary mobile controls are at least 44 px high.
- Reduced-motion mode removes nonessential animation.
- No console error, Vite overlay, or failed request caused by the redesign.

- [ ] **Step 7: Run an independent review and fix all Critical/Important findings**

Request review against `docs/superpowers/specs/2026-07-15-live-markets-operator-cockpit-design.md`. Re-run the affected focused test after every fix, then repeat the full gates from Step 4.

- [ ] **Step 8: Commit the verified polish**

```bash
git add apps/web/src/app/guideSteps.ts apps/web/src/app/guideSteps.test.ts apps/web/src/app/app.smoke.test.tsx apps/web/src/features/markets
git commit -m "test(live-markets): verify responsive judge workflow"
```

## Final completion gate

- [ ] Confirm `git status --short` contains no unintended files.
- [ ] Confirm the branch diff changes only the approved Live Markets frontend, its tests, guide copy, and design/plan documentation.
- [ ] Confirm fresh test, lint, build, browser, accessibility, and independent-review evidence is recorded in the handoff.
- [ ] Present the verified diff to the user before pushing or merging.
