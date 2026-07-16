# Command Center Operational Overview Design

**Date:** 2026-07-16
**Status:** Approved direction; awaiting written-spec review

## Purpose

Turn the Command Center into GoalPulse's high-density operational overview. It should answer, in one scan:

1. What needs attention now?
2. What is running across the fixture and signal pipeline?
3. Are decisions producing credible outcomes?
4. Which strategy is currently strongest?
5. Is the system healthy and verifiable?

The Command Center will not duplicate the detailed odds tape. Historical odds analysis and replay remain owned by Live Markets.

## Product Decision

Remove the current Home/Away odds area chart from the Command Center. It is a drill-down visualization with weaker semantics than the new Live Markets tape: it omits Draw, uses categorical labels, and visually interpolates between observations. Keeping a second version also creates competing sources of truth.

Replace it with compact operational visualizations derived from data GoalPulse already fetches:

- signal outcome composition;
- strategy ROI comparison;
- fixture pipeline distribution;
- risk and exposure snapshot.

No synthetic trend line, invented time series, projected value, or implied historical continuity may be shown.

## Information Architecture

The page follows this scan order:

`Priority -> Live state -> Decisions -> Outcomes -> Strategy -> Risk -> Proof`

### Desktop layout

```text
+-----------------------------------------------------------------------+
| Priority signal                                             Actions   |
+-----------------------------------------------------------------------+
| Live fixtures | Feed age | Signals | Open positions | System health  |
+-----------------------------------------+-----------------------------+
| Decision feed                           | Fixture pipeline            |
| Latest agent and audit events           | Live / upcoming / finished |
|                                         +-----------------------------+
|                                         | Signal outcomes             |
|                                         | Confirmed/rejected/pending  |
+----------------------+------------------+-----------------------------+
| Strategy ROI         | Risk & P&L       | Verification / feed proof   |
+----------------------+------------------+-----------------------------+
```

### Mobile layout

The same order becomes one column. Priority and system status remain above the fold. Charts use compact heights and never require horizontal scrolling. The Decision Feed precedes analytical summaries because it explains the current state.

## Visual Direction

The Command Center should feel like an evidence-led operations console, not a collection of unrelated cards.

- **Palette:** retain GoalPulse tokens: canvas/surface neutrals, amber for attention, teal for positive/live state, violet for proof, red only for confirmed negative or degraded state.
- **Typography:** existing display face for section titles, body face for explanations, monospaced utility face for values and timestamps.
- **Density:** compact labels, strong value alignment, restrained card padding, and shared internal baselines.
- **Signature element:** an "operational horizon" made from the adjacent Fixture Pipeline and Signal Outcomes compositions. It shows the system moving from coverage to audited decisions without pretending those categories form a time series.
- **Motion:** one restrained entrance/update transition on composition segments and status indicators. All chart animation is disabled or reduced when `prefers-reduced-motion` is active.

## Components

### 1. Priority Signal Rail

Keep the existing priority signal, rationale, confidence, and actions. Tighten spacing only where needed to align it with the denser dashboard. The empty state remains actionable and does not imply that the engine is inactive.

### 2. Live Status Strip

Keep the five operational values:

- live fixtures;
- feed freshness;
- signals in window;
- open simulated positions;
- system health.

Values remain text-first. Color supplements rather than replaces labels.

### 3. Decision Feed

Promote the Decision Feed to the largest workbench region. It contains the existing agent timeline, timestamps, and archive action. Rows retain a clear event title, concise evidence detail, and time. If the feed is empty, explain that no decision event is available yet and link to the archive.

### 4. Fixture Pipeline Composition

Show a compact horizontal composition for:

- live fixtures;
- upcoming fixtures;
- finished fixtures.

The chart uses the existing match status counts. Each segment has a text label, count, and percentage. When the total is zero, show an explicit no-fixtures state instead of an empty graph. Clicking the card opens Live Markets; it does not add filtering behavior to the overview.

### 5. Signal Outcome Composition

Show confirmed, rejected, and pending signals from the existing stats payload:

- confirmed = `correctSignals`;
- rejected = `incorrectSignals`;
- pending = `pendingSignals`.

Use a compact ring or segmented composition with the total in the center and a complete labelled legend. Do not label the result as accuracy when no settled signals exist. If there are settled signals, show strategy accuracy as a secondary text readout sourced directly from `strategyAccuracy`.

### 6. Strategy ROI Comparison

Use the existing `/api/arena` response already fetched by the Command Center. Compare Momentum Follower, Contrarian, and Kelly Criterion with horizontal bars on a zero-centered axis so negative ROI is not visually minimized. Each row shows:

- strategy label;
- ROI percent;
- settled count;
- open positions.

The recommendation remains governed by `getMetaAgentRecommendation`; a chart may compare all strategies but must not declare a winner until the existing minimum-settled rule is satisfied. On fetch failure, preserve the rest of the dashboard and show a local unavailable state.

### 7. Risk and P&L Snapshot

Use the already-fetched P&L payload:

- net units;
- ROI percent;
- open positions;
- open exposure;
- settled bets.

This is a text-and-meter summary, not a fabricated bankroll curve. Positive, negative, and neutral values receive semantic tones. A missing P&L payload yields an unavailable state rather than zeroes.

### 8. Trust and Verification Strip

Retain the verification proof and system status, but remove duplicated strategy-leader content because the full Strategy ROI Comparison now owns that story. Show:

- proof availability and shortened hash;
- live-stream state and feed freshness;
- archive failure/pending state when supplied by stats;
- direct actions to Verification and System Health.

## Data Flow and Contracts

`App.tsx` already owns Matches, Stats, P&L, Signals, Health, and the decision timeline. It will pass a focused overview model to `CommandCenterPage` rather than chart-shaped odds data.

The Command Center continues to fetch `/api/arena` on its existing five-second cadence. No new endpoint or polling loop is introduced.

The overview contract will contain:

- existing KPI and priority-signal data;
- fixture status counts;
- signal outcome counts and reported strategy accuracy;
- nullable P&L summary;
- decision feed;
- health, freshness, and archive status;
- navigation callbacks.

The obsolete `CommandCenterChartPoint` type and `chartData` prop will be removed. The shared Live Markets `OddsMovementChart` remains unchanged and remains the sole detailed odds chart.

## Truthfulness Rules

- Every displayed value must map to an existing API or App state field.
- Missing payloads render as unavailable, never as zero unless zero is explicitly returned.
- Category compositions must display their underlying counts in text.
- Percentages use a safe zero-total state.
- Negative ROI uses a true negative direction around a visible zero baseline.
- No chart connects unordered categories or implies change over time.
- Strategy leadership continues to respect the existing minimum sample rule.

## Accessibility

- Each visualization has a visible title and concise explanation.
- Charts expose an equivalent semantic list or table.
- Color is never the sole status cue.
- Interactive cards and actions have visible focus states and minimum touch targets.
- Live regions are limited to meaningful status changes; routine polling does not repeatedly announce the whole dashboard.
- Reduced-motion preferences disable nonessential transitions.
- Responsive layouts preserve reading order and avoid horizontal scroll at 390 px.

## Error and Empty States

- Arena unavailable: isolate the error to Strategy ROI Comparison.
- P&L unavailable: show an explicit unavailable state in Risk and P&L.
- No fixtures: show "No fixtures in the current feed" and zero labelled counts.
- No signals: show a zero-total outcome state without an accuracy claim.
- Degraded stream: retain dashboard data, mark freshness as stale/degraded, and route the action to System Health.

## Testing and Verification

Component tests will verify:

- the obsolete odds chart and chart prop are removed;
- all three category compositions use the correct source counts;
- zero-total and nullable states do not produce `NaN`, misleading zeroes, or false accuracy claims;
- negative and positive strategy ROI render on opposite sides of the zero baseline;
- the minimum-settled strategy recommendation rule remains intact;
- the P&L snapshot uses real nullable values;
- navigation actions route to Live Markets, Archive, Verification, and System Health;
- semantic tables/lists and accessible names are present;
- mobile layout order and reduced-motion classes remain correct.

Verification will include web tests, lint, production build, and direct responsive inspection at desktop, tablet, and 390 px mobile widths.

## Out of Scope

- Changes to Live Markets chart or replay behavior;
- new API endpoints;
- new polling loops;
- historical signal-volume or bankroll time-series charts without a real time-series source;
- dashboard personalization, drag-and-drop, or saved layouts.

## Success Criteria

The finished Command Center:

1. presents more decision-relevant information than the current page;
2. has no detailed odds chart duplication;
3. uses only traceable real data;
4. makes the next operator action obvious;
5. remains understandable without relying on color or animation;
6. stays dense, balanced, and usable from 390 px through wide desktop layouts.
