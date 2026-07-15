# Live Markets Operator Cockpit Design

Date: 2026-07-15

## Objective

Rebuild Live Markets into a dense, judge-readable sports-market operator cockpit. A user must be able to select a fixture, understand its current price state, see the material movement, inspect any signal, and assess data trust without scrolling through several disconnected cards.

The redesign is presentation- and interaction-focused. It preserves the current backend contracts, polling and SSE behavior, replay behavior, signal selection flow, fixture filters, analytics-only positioning, and guided-tour targets.

## Primary audience and page job

The primary audience is a strict hackathon judge evaluating usefulness, technical credibility, and execution under time pressure. The same surface must remain practical for an analyst monitoring several fixtures.

The page has one job: turn the live fixture feed into a fast, trustworthy inspection workflow from fixture selection to price movement to evidence.

## Current problems

- The full-width selected-match card consumes the top of the page before the user can see the market list or chart.
- The market board sits below the chart, so selecting a fixture and seeing its result happen in distant parts of the page.
- Stream state is repeated in the selected-match header, intelligence rail, and chart footer.
- The separate intelligence rail competes with the chart while surfacing only a few short status values.
- Explanatory copy is permanently visible even when the operator already understands the concepts.
- Draw odds appear in the price strip but are omitted from the movement chart even when real draw data exists.
- Signal dots are visually small and depend heavily on chart hover behavior.
- Existing tests prove only basic rendering and do not protect the primary inspection workflow or important degraded states.

## Approaches considered

### 1. Tighten the existing stack

Reduce padding and card heights while retaining the selected-match card, chart-plus-rail row, and full-width market board. This has the lowest implementation risk but does not repair the disconnected select-to-inspect workflow.

### 2. Full data wall

Show the board, prices, chart, signal evidence, and health as equally dense panels. This maximizes visible data but weakens hierarchy and would be difficult to understand during a short judging session.

### 3. Operator cockpit — selected

Place the fixture board beside one dominant selected-market workspace, then integrate secondary trust evidence into a compact strip. This keeps the interaction and its result spatially connected, improves first-viewport comprehension, and adapts cleanly to mobile.

## Information architecture

### Desktop, 1280 px and wider

The page uses a 12-column cockpit:

- Four columns: fixture rail.
- Eight columns: selected-market workspace.
- A compact evidence strip spans the selected workspace beneath the chart.

The fixture rail and selected workspace begin on the same visual baseline. The rail has a bounded internal scroll region rather than extending the entire page. The chart remains the dominant visual.

```text
+------------------------------------------------------------------+
| Live Markets | feed state | last tick | replay control           |
+----------------------+-------------------------------------------+
| Fixture rail         | Selected match + score + H/D/A prices     |
| [filters + counts]   | Verdict + movement meaning                |
| LIVE match           +-------------------------------------------+
| selected match       | Odds movement chart + accessible signals  |
| upcoming match       |                                           |
| finished match       +-------------------------------------------+
| internal scroll      | Field context | audit | coverage | proof  |
+----------------------+-------------------------------------------+
```

### Tablet

At intermediate widths, the fixture rail becomes a compact full-width selection band above the workspace. It shows the active filter and a concise list without forcing a desktop table into limited space.

### Mobile

The order becomes:

1. Feed and replay controls.
2. Filter plus selected-fixture control.
3. Selected match, score, and current prices.
4. Verdict and movement chart.
5. Signal evidence and trust strip.
6. Expandable fixture list.

No surface may create horizontal page overflow at 320 px. Primary actions must provide at least a 44 px touch target.

## Components

### LiveMarketsPage

Owns composition only. It preserves the current prop contract unless a small derived presentation model materially reduces duplication. It must not duplicate polling, SSE, filtering, or replay logic from `App.tsx`.

### LiveMarketToolbar

A slim page-level toolbar that owns the single authoritative feed state. It includes freshness, latest tick, dropped-update notice, and replay start/stop. Status wording must distinguish live, connecting, stale, replay, and waiting states truthfully.

### MarketFixtureRail

Replaces the detached bottom Market Board. It provides:

- All, Live, Upcoming, and Finished filters with counts.
- Live-first ordering only in the All view.
- Strong selected state and keyboard selection.
- Status, teams, score or start time, freshness, and an explicit inspect affordance.
- A bounded empty state specific to the active filter.

Desktop uses compact rows rather than a wide table because the rail is a selection control, not an audit ledger. Mobile uses full-width buttons with equivalent information.

### SelectedMarketWorkspace

Combines the useful parts of the oversized selected-match card and current price strip:

- Teams, precise fixture state, clock, and score.
- Home, Draw, and Away decimal odds with tick direction.
- One concise market verdict and severity.
- Market-pressure context only when signal-backed data exists.

The selected match is the workspace header, not a separate hero card.

### OddsMovementChart

Remains the dominant artifact and keeps real TxLINE snapshot semantics. Changes:

- Render Home, Draw, and Away series when values exist.
- Keep stable color mapping between price strip, chart, tooltip, and legend.
- Use truthful snapshot/time labels; never imply the x-axis is match minute.
- Provide an accessible name, concise description, and screen-reader data summary/table.
- Pair signal markers with a keyboard-accessible signal list or inspect controls adjacent to the chart.
- Preserve reduced-motion behavior and disable nonessential chart animation when the user requests reduced motion.

### MarketEvidenceStrip

Replaces the separate intelligence rail with compact, non-card-within-card evidence cells:

- Field context.
- Outcome audit record with explicit denominator meaning.
- Snapshot or fixture coverage.
- Signal/proof state for the selected fixture.

Items with more explanation use a tooltip, disclosure, or existing signal drawer rather than permanent paragraphs.

## Visual direction

The page should look like a purpose-built sports-market trading terminal, not a generic SaaS dashboard.

- Keep GoalPulse's existing near-black surfaces, amber Home series, teal Away series, and proof violet for Draw.
- Use the existing display face for fixture identity, monospace/tabular numerals for score, clock, prices, and movement, and the body face for guidance.
- Reduce rounded containers and nested card borders. Use hairline separators and aligned columns to communicate relationships.
- Spend visual emphasis on one signature element: a continuous selected-market tape connecting fixture identity, H/D/A prices, latest movement, and the chart.
- Use color semantically. Severity, freshness, and fixture status must never rely on color alone.
- Remove decorative gradients except where already part of the global system and necessary for continuity.

## Interaction and data flow

1. `App.tsx` continues to own matches, selection, snapshots, signals, replay, health, and stream state.
2. Selecting a fixture in the rail calls the existing `onSelectMatch` callback.
3. Derived prices, chart points, pressure, field context, and markers update through the existing prop flow.
4. Selecting a signal calls the existing `onSelectSignalId` callback and opens the established audit/inspection flow.
5. Filtering changes only the rail contents. The selected workspace remains stable unless the application deliberately changes the selected match.
6. Replay uses the existing callback and progress values; the toolbar must clearly distinguish replay from live data.

## Loading, empty, stale, and error behavior

- No fixtures: explain that the fixture feed has not produced matches yet and retain feed-state context.
- Empty filter: name the active filter and offer a one-click return to All.
- Fixture selected but no snapshots: keep identity and score visible, then show a bounded chart empty state.
- Connecting: retain previously loaded data and label it as waiting or reconnecting rather than clearing it.
- Stale: show the last known tick and a stale state without pulsing live indicators.
- Dropped SSE payload: show one compact, non-blocking warning while keeping the stream and prior data visible.
- Replay: label every relevant context as replay and never present it as current live movement.
- Missing draw data: omit the Draw line while preserving the Draw price placeholder and accessible explanation.

## Accessibility

- One logical page heading supplied by the application shell/page header contract.
- Semantic buttons for fixture selection and signal inspection.
- `aria-current` or `aria-pressed` for the selected fixture as appropriate.
- Visible keyboard focus and logical tab order from toolbar to fixtures to chart evidence.
- Chart name, description, and nonvisual data representation.
- Status changes announced politely without repeatedly announcing every market tick.
- Minimum 44 px primary touch targets on mobile.
- Text and nontext contrast must meet WCAG AA targets.

## Testing strategy

Add focused tests that cover:

- Default composition and one page heading.
- Fixture filtering, count labels, live-first All ordering, and selection callback.
- Selected fixture identity, score, clock, and current H/D/A odds.
- Draw series inclusion only when real draw data exists.
- Replay toggle and replay labeling.
- Live, connecting, stale, waiting, and dropped-update states.
- No fixtures, empty filter, and no snapshots states.
- Signal inspect actions and callback behavior.
- Accessible fixture controls, chart labeling, and keyboard-reachable actions.
- Mobile/desktop-equivalent content without duplicate interactive controls exposed to assistive technology.

Browser verification must cover 1440, 1024, 768, 390, and 320 px; first-viewport hierarchy, horizontal overflow, focus visibility, reduced motion, and console errors must be checked.

## Acceptance criteria

- At 1440 px, the fixture rail, selected identity/current prices, verdict, and chart are all visible in the first viewport under the global app chrome.
- Fixture selection and its resulting chart update are spatially connected.
- Feed state is rendered once as the authoritative status.
- Draw movement is represented when the existing data provides it.
- No invented values, unsupported provider claims, or changed analytics logic.
- Existing replay, signal inspection, filters, guided-tour navigation, and data-fetching behavior continue to work.
- No horizontal page overflow from 320 px upward.
- Full web tests, lint, TypeScript build, and production Vite build pass.
- Independent review reports no remaining Critical or Important findings.

## Out of scope

- Backend or API contract changes.
- New odds providers or market types.
- Changes to signal thresholds, confidence calculations, or outcome grading.
- A new global design system or navigation redesign.
- Real-money betting actions, transactions, or wagering language.
