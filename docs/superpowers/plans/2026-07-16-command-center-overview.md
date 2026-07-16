# Command Center Operational Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicate Command Center odds chart with a dense, truthful operational overview of fixture coverage, signal outcomes, strategy ROI, risk, decisions, and trust evidence.

**Architecture:** Keep `App.tsx` as the owner of already-fetched Matches, Stats, P&L, Health, and decision events. Add pure overview-model helpers and two focused visualization components, then compose them in `CommandCenterPage` while preserving the existing isolated `/api/arena` poll. Live Markets remains the only owner of detailed odds history and replay.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, Vitest 4, Testing Library, existing Lucide icons; no new dependency.

## Global Constraints

- Use only existing API or App state fields; do not synthesize time-series data, projected values, or implied historical continuity.
- Missing payloads render as unavailable, never as zero unless zero was explicitly returned.
- The detailed `OddsMovementChart` and replay controls remain exclusive to Live Markets.
- Category visualizations expose their underlying counts in visible text and semantic lists.
- Strategy leadership must continue to use `getMetaAgentRecommendation` and `MIN_SETTLED_FOR_RANKING`.
- Negative ROI must render on the negative side of a visible zero baseline.
- Preserve keyboard focus, 44 px touch targets, color-independent labels, reduced-motion behavior, and a no-horizontal-scroll layout at 390 px.
- Add no API endpoint, polling loop, or package dependency.

## File Structure

- Create `apps/web/src/features/overview/commandCenterOverview.ts`: pure input types and safe composition/ROI geometry helpers.
- Create `apps/web/src/features/overview/commandCenterOverview.test.ts`: unit tests for zero totals, percentages, nullable values, and ROI direction.
- Create `apps/web/src/features/overview/OperationalComposition.tsx`: reusable accessible segmented composition for fixtures and signal outcomes.
- Create `apps/web/src/features/overview/OperationalComposition.test.tsx`: semantic and empty-state component tests.
- Create `apps/web/src/features/overview/StrategyRoiComparison.tsx`: zero-centered arena ROI comparison and recommendation state.
- Create `apps/web/src/features/overview/StrategyRoiComparison.test.tsx`: positive, negative, insufficient-sample, loading, and unavailable tests.
- Create `apps/web/src/features/overview/RiskSnapshot.tsx`: nullable P&L summary without an invented curve.
- Create `apps/web/src/features/overview/RiskSnapshot.test.tsx`: real, zero, and unavailable P&L tests.
- Modify `apps/web/src/features/overview/CommandCenterPage.tsx`: remove Recharts odds chart and compose the operational workbench.
- Modify `apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx`: update the public contract, navigation, accessibility, and responsive assertions.
- Modify `apps/web/src/App.tsx`: pass fixture, signal outcome, archive, and nullable P&L data instead of `chartData`.

---

### Task 1: Truthful overview model

**Files:**
- Create: `apps/web/src/features/overview/commandCenterOverview.ts`
- Create: `apps/web/src/features/overview/commandCenterOverview.test.ts`

**Interfaces:**
- Produces: `CompositionItem`, `CompositionSegment`, `SignalOutcomeSummary`, `FixturePipelineSummary`, `CommandCenterPnlSummary`, `toCompositionSegments(items)`, and `toRoiGeometry(value, values)`.
- Consumes: primitive counts and nullable P&L fields from `App.tsx`; no React or API dependency.

- [ ] **Step 1: Write failing unit tests for safe compositions and ROI direction**

```ts
import { describe, expect, it } from "vitest";
import { toCompositionSegments, toRoiGeometry } from "./commandCenterOverview";

describe("commandCenterOverview", () => {
  it("preserves counts and calculates a complete composition", () => {
    expect(toCompositionSegments([
      { id: "confirmed", label: "Confirmed", count: 2, tone: "positive" },
      { id: "rejected", label: "Rejected", count: 1, tone: "danger" },
      { id: "pending", label: "Pending", count: 1, tone: "warning" },
    ])).toEqual({
      total: 4,
      segments: [
        { id: "confirmed", label: "Confirmed", count: 2, tone: "positive", percent: 50 },
        { id: "rejected", label: "Rejected", count: 1, tone: "danger", percent: 25 },
        { id: "pending", label: "Pending", count: 1, tone: "warning", percent: 25 },
      ],
    });
  });

  it("returns zero percentages instead of NaN when every count is zero", () => {
    const result = toCompositionSegments([
      { id: "live", label: "Live", count: 0, tone: "positive" },
      { id: "upcoming", label: "Upcoming", count: 0, tone: "info" },
      { id: "finished", label: "Finished", count: 0, tone: "neutral" },
    ]);
    expect(result.total).toBe(0);
    expect(result.segments.map((segment) => segment.percent)).toEqual([0, 0, 0]);
  });

  it("places positive and negative ROI on opposite sides of zero", () => {
    expect(toRoiGeometry(20, [20, -10, 0])).toEqual({ direction: "positive", widthPercent: 100 });
    expect(toRoiGeometry(-10, [20, -10, 0])).toEqual({ direction: "negative", widthPercent: 50 });
    expect(toRoiGeometry(0, [20, -10, 0])).toEqual({ direction: "neutral", widthPercent: 0 });
  });
});
```

- [ ] **Step 2: Run the model test and confirm the red state**

Run: `cd apps/web && npm.cmd test -- src/features/overview/commandCenterOverview.test.ts`

Expected: FAIL because `./commandCenterOverview` does not exist.

- [ ] **Step 3: Implement the pure overview types and helpers**

```ts
export type CompositionTone = "positive" | "danger" | "warning" | "info" | "neutral";

export interface CompositionItem {
  id: string;
  label: string;
  count: number;
  tone: CompositionTone;
}

export interface CompositionSegment extends CompositionItem {
  percent: number;
}

export interface SignalOutcomeSummary {
  confirmed: number;
  rejected: number;
  pending: number;
  strategyAccuracy: number | null;
}

export interface FixturePipelineSummary {
  live: number;
  upcoming: number;
  finished: number;
}

export interface CommandCenterPnlSummary {
  netUnits: number;
  roiPercent: number;
  openPositions: number;
  openExposure: number;
  settledBets: number;
}

export function toCompositionSegments(items: CompositionItem[]) {
  const normalized = items.map((item) => ({ ...item, count: Math.max(0, item.count) }));
  const total = normalized.reduce((sum, item) => sum + item.count, 0);
  return {
    total,
    segments: normalized.map((item) => ({
      ...item,
      percent: total === 0 ? 0 : (item.count / total) * 100,
    })),
  };
}

export function toRoiGeometry(value: number, values: number[]) {
  const extent = Math.max(1, ...values.map((current) => Math.abs(current)));
  return {
    direction: value > 0 ? "positive" as const : value < 0 ? "negative" as const : "neutral" as const,
    widthPercent: (Math.abs(value) / extent) * 100,
  };
}
```

- [ ] **Step 4: Run the focused test and confirm green**

Run: `cd apps/web && npm.cmd test -- src/features/overview/commandCenterOverview.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the model**

```powershell
git add apps/web/src/features/overview/commandCenterOverview.ts apps/web/src/features/overview/commandCenterOverview.test.ts
git commit -m "feat(command-center): model truthful overview metrics"
```

---

### Task 2: Accessible operational compositions

**Files:**
- Create: `apps/web/src/features/overview/OperationalComposition.tsx`
- Create: `apps/web/src/features/overview/OperationalComposition.test.tsx`

**Interfaces:**
- Consumes: `CompositionItem[]` and `toCompositionSegments` from Task 1.
- Produces: `OperationalComposition({ title, description, items, emptyMessage, unavailableMessage, actionLabel, onAction, secondaryReadout })`; `items` accepts `CompositionItem[] | null` so loading/unavailable data never becomes a false zero.

- [ ] **Step 1: Write failing component tests for labelled counts, action, and zero state**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationalComposition } from "./OperationalComposition";

describe("OperationalComposition", () => {
  it("renders every source count as semantic content", () => {
    render(<OperationalComposition
      title="Signal outcomes"
      description="Audited engine decisions"
      items={[
        { id: "confirmed", label: "Confirmed", count: 25, tone: "positive" },
        { id: "rejected", label: "Rejected", count: 54, tone: "danger" },
        { id: "pending", label: "Pending", count: 42, tone: "warning" },
      ]}
      emptyMessage="No signals have entered the audit yet."
      secondaryReadout="32% reported accuracy"
    />);
    expect(screen.getByRole("region", { name: "Signal outcomes" })).toBeInTheDocument();
    expect(screen.getByText("121")).toBeInTheDocument();
    expect(screen.getByText("Confirmed").closest("li")).toHaveTextContent("25");
    expect(screen.getByText("Rejected").closest("li")).toHaveTextContent("54");
    expect(screen.getByText("Pending").closest("li")).toHaveTextContent("42");
    expect(screen.getByText("32% reported accuracy")).toBeInTheDocument();
  });

  it("shows the explicit zero state and still exposes an action", () => {
    const onAction = vi.fn();
    render(<OperationalComposition
      title="Fixture pipeline"
      description="Current fixture coverage"
      items={[
        { id: "live", label: "Live", count: 0, tone: "positive" },
        { id: "upcoming", label: "Upcoming", count: 0, tone: "info" },
        { id: "finished", label: "Finished", count: 0, tone: "neutral" },
      ]}
      emptyMessage="No fixtures in the current feed."
      actionLabel="Open Live Markets"
      onAction={onAction}
    />);
    expect(screen.getByText("No fixtures in the current feed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Live Markets" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(document.body).not.toHaveTextContent("NaN");
  });

  it("distinguishes unavailable data from a real zero", () => {
    render(<OperationalComposition
      title="Signal outcomes"
      description="Audited engine decisions"
      items={null}
      emptyMessage="No signals have entered the audit yet."
      unavailableMessage="Signal audit data unavailable."
    />);
    expect(screen.getByText("Signal audit data unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("0 total")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the component test and confirm the red state**

Run: `cd apps/web && npm.cmd test -- src/features/overview/OperationalComposition.test.tsx`

Expected: FAIL because `OperationalComposition` does not exist.

- [ ] **Step 3: Implement the shared segmented visualization**

Implement a `section` with `aria-labelledby`, a text total, a flex composition rail, a visible `<ul>` containing label/count/percentage, an optional secondary readout, and an optional 44 px action button. Use this exact tone map:

```ts
const toneClass = {
  positive: "bg-positive",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  neutral: "bg-stone-500",
} as const;
```

Each segment width is `${segment.percent}%`; `items === null` renders `unavailableMessage`, while a non-null zero-total composition renders `emptyMessage`. Add `motion-safe:transition-[width] motion-safe:duration-500 motion-reduce:transition-none` to nonzero segments. Keep the labelled zero counts visible only for a real zero-total payload.

- [ ] **Step 4: Run both overview tests**

Run: `cd apps/web && npm.cmd test -- src/features/overview/commandCenterOverview.test.ts src/features/overview/OperationalComposition.test.tsx`

Expected: 5 tests pass.

- [ ] **Step 5: Commit the operational compositions**

```powershell
git add apps/web/src/features/overview/OperationalComposition.tsx apps/web/src/features/overview/OperationalComposition.test.tsx
git commit -m "feat(command-center): add operational composition visuals"
```

---

### Task 3: Strategy ROI and risk summaries

**Files:**
- Create: `apps/web/src/features/overview/StrategyRoiComparison.tsx`
- Create: `apps/web/src/features/overview/StrategyRoiComparison.test.tsx`
- Create: `apps/web/src/features/overview/RiskSnapshot.tsx`
- Create: `apps/web/src/features/overview/RiskSnapshot.test.tsx`

**Interfaces:**
- Consumes: `ArenaResponse`, `getMetaAgentRecommendation`, `formatRoi`, `toRoiGeometry`, and nullable `CommandCenterPnlSummary`.
- Produces: `StrategyRoiComparison({ arena, isUnavailable })` and `RiskSnapshot({ pnl })`.

- [ ] **Step 1: Write failing tests for the zero-centered strategy comparison**

Create an arena fixture with Momentum ROI `20`, Contrarian ROI `-10`, and Kelly ROI `0`. Assert:

```tsx
expect(screen.getByTestId("roi-bar-momentum_follower")).toHaveAttribute("data-direction", "positive");
expect(screen.getByTestId("roi-bar-contrarian")).toHaveAttribute("data-direction", "negative");
expect(screen.getByTestId("roi-bar-kelly_criterion")).toHaveAttribute("data-direction", "neutral");
expect(screen.getByText("+20%")).toBeInTheDocument();
expect(screen.getByText("-10%")).toBeInTheDocument();
expect(screen.getByText(/Momentum Follower currently leads/)).toBeInTheDocument();
```

Add separate cases for `arena={null}` with `isUnavailable={false}`, `arena={null}` with `isUnavailable={true}`, and an arena where fewer than two scoreboards have five settled positions; the last case must render `Not enough settled positions yet to recommend a leading strategy.`

- [ ] **Step 2: Write failing risk snapshot tests**

```tsx
render(<RiskSnapshot pnl={{ netUnits: -2.5, roiPercent: -8, openPositions: 3, openExposure: 3, settledBets: 31 }} />);
expect(screen.getByText("-2.50u")).toHaveClass("text-danger");
expect(screen.getByText("-8%")).toBeInTheDocument();
expect(screen.getByText("3.00u")).toBeInTheDocument();

render(<RiskSnapshot pnl={null} />);
expect(screen.getByText("P&L data unavailable.")).toBeInTheDocument();
```

- [ ] **Step 3: Run the two new test files and confirm red**

Run: `cd apps/web && npm.cmd test -- src/features/overview/StrategyRoiComparison.test.tsx src/features/overview/RiskSnapshot.test.tsx`

Expected: FAIL because both components are missing.

- [ ] **Step 4: Implement `StrategyRoiComparison`**

Render three labelled rows from `momentumFollower`, `contrarian`, and `kellyCriterion`. Each row uses a two-half grid around a visible center rule. A negative fill anchors to the right edge of the left half; a positive fill anchors to the left edge of the right half. Set `data-direction` from `toRoiGeometry` for testability. Render ROI, settled count, and open positions as text. Use `getMetaAgentRecommendation(arena).message` verbatim for the recommendation line.

Loading copy: `Waiting for arena data.`

Unavailable copy: `Arena data unavailable.`

- [ ] **Step 5: Implement `RiskSnapshot`**

Render `netUnits`, `roiPercent`, `openPositions`, `openExposure`, and `settledBets` in a compact definition list. Add a signed ROI rail with a fixed, labelled `-100% / 0 / +100%` scale; clamp only the visual fill while always displaying the exact ROI as text. Format units with two decimals and a trailing `u`; prefix positive net units and ROI with `+`. Use positive/danger/neutral text classes based on the number sign. For `pnl === null`, render only `P&L data unavailable.` and an action-neutral explanation.

- [ ] **Step 6: Run focused strategy and risk tests**

Run: `cd apps/web && npm.cmd test -- src/features/overview/StrategyRoiComparison.test.tsx src/features/overview/RiskSnapshot.test.tsx`

Expected: all cases pass.

- [ ] **Step 7: Commit strategy and risk summaries**

```powershell
git add apps/web/src/features/overview/StrategyRoiComparison.tsx apps/web/src/features/overview/StrategyRoiComparison.test.tsx apps/web/src/features/overview/RiskSnapshot.tsx apps/web/src/features/overview/RiskSnapshot.test.tsx
git commit -m "feat(command-center): compare strategy ROI and risk"
```

---

### Task 4: Integrate the operational workbench

**Files:**
- Modify: `apps/web/src/features/overview/CommandCenterPage.tsx`
- Modify: `apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: components from Tasks 2 and 3 plus the existing Arena poll.
- Produces: the final `CommandCenterPageProps` contract without `selectedFixtureLabel` or `chartData`; stats-derived fields remain nullable until a real payload arrives.

- [ ] **Step 1: Replace the smoke-test fixture with the new public contract**

Use these new props in `baseProps`:

```ts
fixturePipeline: { live: 4, upcoming: 1, finished: 6 },
signalOutcomes: { confirmed: 25, rejected: 54, pending: 42, strategyAccuracy: 31.6 },
pnl: { netUnits: 4.25, roiPercent: 9.2, openPositions: 3, openExposure: 3, settledBets: 79 },
archiveStatus: { pending: 0, failures: 0 },
```

Remove `selectedFixtureLabel` and `chartData`. Replace the old market-chart test with assertions for regions named `Fixture pipeline`, `Signal outcomes`, `Strategy ROI comparison`, and `Risk and P&L`. Assert that `Market Pulse`, `Market odds movement`, and `Fewer than two comparable odds points` are absent.

- [ ] **Step 2: Add integration tests for navigation and truthful nullable states**

Assert `Open Live Markets` routes to `live-markets`; retain signal, verification, archive, and system-health assertions. Add one render with all fixture and signal counts zero plus `pnl={null}` and assert no `NaN`, no accuracy claim, and the explicit zero/unavailable messages.

- [ ] **Step 3: Run the Command Center smoke test and confirm red**

Run: `cd apps/web && npm.cmd test -- src/features/overview/CommandCenterPage.smoke.test.tsx`

Expected: FAIL because `CommandCenterPageProps` still expects the odds-chart contract.

- [ ] **Step 4: Replace the Command Center contract and imports**

Remove Recharts imports, `CommandCenterChartPoint`, `selectedFixtureLabel`, and `chartData`. Add:

```ts
import { OperationalComposition } from "./OperationalComposition";
import { RiskSnapshot } from "./RiskSnapshot";
import { StrategyRoiComparison } from "./StrategyRoiComparison";
import type { CommandCenterPnlSummary, FixturePipelineSummary, SignalOutcomeSummary } from "./commandCenterOverview";

export interface CommandCenterArchiveStatus {
  pending: number;
  failures: number;
}

export interface CommandCenterPageProps {
  kpis: CommandCenterKpis;
  fixturePipeline: FixturePipelineSummary;
  signalOutcomes: SignalOutcomeSummary | null;
  pnl: CommandCenterPnlSummary | null;
  archiveStatus: CommandCenterArchiveStatus | null;
  decisionFeed: CommandCenterDecisionStep[];
  latestSignal: CommandCenterLatestSignal | null;
  systemHealthLabel: string;
  isSystemHealthy: boolean;
  onNavigate: (destination: DestinationId) => void;
}
```

Also change `CommandCenterKpis.signalsInWindow` and `openSimulatedPositions` to `number | null`. The Live Status Strip renders `—` for null and `0` only for an explicit zero.

- [ ] **Step 5: Replace the market workspace with the 12-column operational workbench**

Use `lg:grid-cols-12`. Give Decision Feed `lg:col-span-7`; place Fixture Pipeline and Signal Outcomes in a stacked `lg:col-span-5` rail. Under it, use a three-column desktop row containing Strategy ROI Comparison, Risk Snapshot, and Trust/Verification. Feed these exact composition items:

```ts
const fixtureItems = [
  { id: "live", label: "Live", count: fixturePipeline.live, tone: "positive" as const },
  { id: "upcoming", label: "Upcoming", count: fixturePipeline.upcoming, tone: "info" as const },
  { id: "finished", label: "Finished", count: fixturePipeline.finished, tone: "neutral" as const },
];

const outcomeItems = signalOutcomes ? [
  { id: "confirmed", label: "Confirmed", count: signalOutcomes.confirmed, tone: "positive" as const },
  { id: "rejected", label: "Rejected", count: signalOutcomes.rejected, tone: "danger" as const },
  { id: "pending", label: "Pending", count: signalOutcomes.pending, tone: "warning" as const },
] : null;

const hasSettledSignals = signalOutcomes != null
  && signalOutcomes.confirmed + signalOutcomes.rejected > 0;
const accuracyReadout = hasSettledSignals && signalOutcomes?.strategyAccuracy != null
  ? `${signalOutcomes.strategyAccuracy}% reported accuracy`
  : undefined;
```

Trust/Verification must display arena proof state, stream health, archive pending/failure counts, and buttons to Verification and System Health. Remove the duplicated Strategy Leader cell.

- [ ] **Step 6: Update `App.tsx` to pass only existing real data**

Replace the old chart props with:

```tsx
fixturePipeline={{
  live: matchStatusCounts.live,
  upcoming: matchStatusCounts.scheduled,
  finished: matchStatusCounts.finished,
}}
signalOutcomes={stats ? {
  confirmed: stats?.correctSignals ?? 0,
  rejected: stats?.incorrectSignals ?? 0,
  pending: stats?.pendingSignals ?? 0,
  strategyAccuracy: stats.strategyAccuracy,
} : null}
pnl={pnl ? {
  netUnits: pnl.netUnits,
  roiPercent: pnl.roiPercent,
  openPositions: pnl.openPositions,
  openExposure: pnl.openExposure,
  settledBets: pnl.settledBets,
} : null}
archiveStatus={stats ? {
  pending: stats.oddsArchive?.pending ?? 0,
  failures: stats.oddsArchive?.failures ?? 0,
} : null}
```

Update the two nullable KPI assignments at the same call site:

```tsx
signalsInWindow: stats?.signalsGenerated ?? null,
openSimulatedPositions: pnl?.openPositions ?? null,
```

- [ ] **Step 7: Run all overview tests**

Run: `cd apps/web && npm.cmd test -- src/features/overview`

Expected: all overview model, component, and Command Center tests pass.

- [ ] **Step 8: Commit the integrated dashboard**

```powershell
git add apps/web/src/App.tsx apps/web/src/features/overview/CommandCenterPage.tsx apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx
git commit -m "feat(command-center): build operational overview dashboard"
```

---

### Task 5: Responsive, accessibility, and release verification

**Files:**
- Modify if verification exposes a defect: `apps/web/src/features/overview/CommandCenterPage.tsx`
- Modify if verification exposes a defect: `apps/web/src/features/overview/OperationalComposition.tsx`
- Modify if verification exposes a defect: `apps/web/src/features/overview/StrategyRoiComparison.tsx`
- Modify if verification exposes a defect: `apps/web/src/features/overview/RiskSnapshot.tsx`
- Modify alongside any fix: the corresponding overview test file.

**Interfaces:**
- Consumes: the complete dashboard from Task 4.
- Produces: verified responsive and production-build evidence; no new feature contract.

- [ ] **Step 1: Add source-level responsive and motion assertions**

Extend the smoke/component tests to assert the workbench contains `lg:grid-cols-12`, no fixed pixel width that can overflow 390 px, composition segments contain `motion-reduce:transition-none`, and every card has a named region or heading relationship.

- [ ] **Step 2: Run the entire web test suite**

Run: `cd apps/web && npm.cmd test`

Expected: every web test passes with zero failures.

- [ ] **Step 3: Run lint**

Run: `cd apps/web && npm.cmd run lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Run the production build**

Run: `cd apps/web && npm.cmd run build`

Expected: TypeScript and Vite build succeed. Record any existing bundle-size warning separately; do not claim it was introduced by this feature without comparing artifacts.

- [ ] **Step 5: Inspect the dashboard at three viewport widths**

Open the Command Center at 1440 px, 1024 px, and 390 px. Confirm the priority rail and status strip lead, the Decision Feed precedes analytical cards in DOM and visual order, ROI bars cross the zero baseline correctly, all counts are readable, no horizontal scroll exists, focus indicators are visible, and reduced-motion mode removes nonessential transitions.

- [ ] **Step 6: Run final repository checks and commit verification fixes**

Run: `git diff --check` and `git status --short`.

If Task 5 changed code, stage only the overview files and commit:

```powershell
git add apps/web/src/features/overview
git commit -m "fix(command-center): finish responsive dashboard polish"
```

If no code changed, do not create an empty commit.

## Completion Evidence

Before declaring completion, report:

- overview-focused test count and result;
- complete web test count and result;
- lint result;
- production build result;
- responsive inspection widths and any limitation;
- the exact commits created;
- confirmation that Live Markets still owns the only detailed odds chart.
