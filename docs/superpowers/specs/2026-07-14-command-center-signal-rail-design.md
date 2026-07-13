# GoalPulse Command Center Signal Rail Design

## Problem

The current Command Center technically reduces equal-height grid gaps, but the live production screenshot still reads as a generic dashboard. The priority card dominates the viewport without delivering equivalent scan value, long prose creates a wall of text, the metric cards repeat nested-card chrome, actions are detached from the evidence they operate on, and the market chart starts too low.

## Success criteria

- The operator can identify the fixture, signal, confidence, evidence state, and next action in under two seconds.
- The first desktop viewport shows the complete priority signal, live status strip, and the beginning of both market evidence and decision activity.
- No major panel is made tall by prose alone.
- Live context uses alignment and dividers rather than a grid of nested cards.
- Desktop, tablet, and mobile preserve a task-first reading order without horizontal page overflow.
- Existing data, polling, navigation, verification, empty states, and product-tour targeting remain functional.

## Considered approaches

### 1. Signal Rail Command Surface — selected

A compact horizontal intelligence rail leads the page. Fixture and signal anchor the left, concise evidence occupies the center, and confidence plus actions sit on the right. A single live-status strip follows. The main workspace is a wide market chart with a narrow decision/activity rail.

This provides the strongest scan path, removes the oversized hero-card feeling, and better resembles an operational market terminal while remaining original to GoalPulse.

### 2. Split Console

A strict 50/50 layout would place the signal and chart on the left and system activity on the right. It is predictable, but gives secondary activity too much width and would compress the chart.

### 3. Market-first Dashboard

The chart would become the top focal point with the priority signal overlaid or placed beside it. This maximizes data visualization, but weakens GoalPulse's key differentiator: explaining the most important actionable signal first.

## Information architecture

1. **Priority signal rail:** match, target, move, evidence, one-sentence rationale, confidence, inspect and verify actions.
2. **Live status strip:** fixtures, feed freshness, signal count, positions, system health, and last update in one aligned row.
3. **Market workspace:** chart and fixture context as the dominant evidence surface.
4. **Decision rail:** recent autonomous actions in a compact timeline with a direct archive action.
5. **Trust footer:** strategy leader and verification proof shown as a slim evidence bar rather than three large cards.

## Visual system

- Preserve the established near-black, slate, amber, blue, positive, and proof palette.
- Use amber only for the active signal and primary action; blue for comparative market evidence; green for healthy verified state.
- Replace repeated eyebrow/title pairs with direct labels in compact surfaces.
- Keep radii, borders, font families, focus styles, and 4-point spacing scale already established by the product.
- Use cards only for distinct workspace surfaces; use dividers and alignment inside them instead of nested bordered boxes.

## Responsive behavior

- **Desktop (>= 1024px):** full-width signal rail, full-width status strip, 8/4 market-to-activity workspace, slim trust footer.
- **Tablet (768–1023px):** signal rail uses a two-column evidence layout; market and decision surfaces stack; status items wrap into two rows without nested cards.
- **Mobile (< 768px):** signal rail becomes a compact vertical sequence; actions remain 44px targets; metrics use a two-column divider grid; chart, decision feed, and trust evidence stack naturally.

## Content and interaction

- Derive a concise explanation preview from the existing explanation without fabricating new evidence; preserve the full explanation in accessible title text and the Signals destination.
- Keep `Inspect signal` and `Open verification` as the two explicit signal actions.
- Keep `guide-decision-feed` and `guide-command-center-overview` stable for the existing product tour.
- Empty and unavailable states remain explicit and truthful.

## Testing

- Update component tests for the revised semantic structure and navigation.
- Verify empty, pending, unavailable, and populated arena states.
- Run unit tests, lint, production build, and the layout detector.
- Browser-check desktop, tablet, and mobile for hierarchy, overflow, action reachability, and console errors.

## Scope

This pass changes the Command Center composition and any narrowly required shared header behavior. It does not redesign the global app shell, change backend contracts, add dependencies, or alter signal-generation logic.
