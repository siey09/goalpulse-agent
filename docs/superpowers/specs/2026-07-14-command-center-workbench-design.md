# GoalPulse Command Center Workbench Design

## Objective

Transform the Command Center from a sequence of equal-height dashboard rows into a dense, trustworthy operator workbench. A first-time judge or analyst must understand the top signal, its evidence, confidence, system context, and next action within five seconds while retaining access to chart, audit, strategy, and verification detail.

## Selected Direction

Use an asymmetric Operator Workbench rather than simple spacing compression or a decorative bento grid. Desktop uses two independently flowing columns so a short right-rail module never stretches to match a tall left module. Tablet uses a deliberate two-column intermediate layout. Mobile reorders content around the decision task and compresses secondary status into a horizontal utility band.

## Information Hierarchy

1. Priority signal: match, target, movement, severity, confidence, field evidence, and explanation.
2. Immediate actions: inspect the signal, open verification, compare market context, or resolve health degradation.
3. Live metrics: fixtures, freshness, signals in window, and open simulated positions.
4. Market evidence: odds movement chart for the selected fixture.
5. Decision audit: latest autonomous processing steps with timestamps.
6. Trust utilities: strategy leader, proof readiness, and system health.

## Layout

### Desktop (1024px and above)

- Constrain the command surface to `max-w-[1600px]` and center it.
- Render one 12-column workbench with independent vertical stacks:
  - Left, 8 columns: priority signal followed by Market Pulse.
  - Right, 4 columns: next actions, compact live metrics, then Decision Feed.
- Render strategy, verification, and system health as one compact three-cell utility strip below the workbench.
- Use 16px grid gutters, 16–20px primary-card padding, 12–16px compact-module padding, and 24px between major zones.

### Tablet (768–1023px)

- Priority signal spans full width.
- Next actions and compact metrics share a two-column row.
- Market Pulse spans full width.
- Decision Feed and utility status use a balanced two-column region.
- Avoid three narrow summary cards at the 768px breakpoint.

### Mobile (below 768px)

- Order: priority signal, actions, horizontally scrollable metrics, chart, decision feed, utility strip.
- Reduce card padding to 12–16px and grid gaps to 12px.
- Use a 208px chart height, increasing to 240px on tablet and 288px on desktop.
- Keep touch targets at least 44px high.
- Allow the utility strip to scroll horizontally instead of creating a long tail of separate cards.

## Component Changes

- `CommandCenterPage.tsx`: replace two equal-height `8/4` rows with one independent-column workbench; consolidate bottom cards into a utility strip; introduce compact metric items; reorder responsively.
- `SectionHeader.tsx`: add `size` (`compact`, `standard`, `primary`) and optional `subtitle` so compact modules do not pay the same header-height tax and the selected fixture no longer needs a negative margin.
- `CommandCenterPage.smoke.test.tsx`: assert the new task sequence, destination actions, utility semantics, and absence of the old standalone summary-card structure.
- `SectionHeader.test.tsx`: cover size and subtitle behavior.

## Visual System

- Preserve the near-black instrument-console palette and restrained amber accent.
- Reserve amber for the priority signal, active state, and primary action.
- Use blue for market evidence, green for verified/healthy state, purple for proof, and neutral surfaces for structure.
- Remove repeated eyebrow-plus-large-title treatment from compact modules.
- Avoid nested cards, decorative gradients, glass effects, and equal-card galleries.

## States and Interaction

- Empty signal state retains the same priority position and explains what will cause data to appear.
- Degraded health changes the first recommended action to System Health without moving the control.
- Missing arena data shows concise inline unavailable copy inside the utility strip rather than oversized empty cards.
- Buttons preserve keyboard focus, 44px touch targets, hover feedback, and meaningful labels.
- No decorative animation; only 150–200ms color/state transitions. Respect reduced motion through the existing global policy.

## Acceptance Criteria

- No equal-height row couples the priority card to the action rail or the chart to the decision feed.
- At 1440px, the primary signal, action rail, metrics, chart, and at least part of the decision feed fit above or near the first viewport fold.
- At 768–1023px, the page uses available width instead of becoming one long column.
- At 320–390px, no horizontal page overflow occurs; only explicit metric/utility rails may scroll within their own containers.
- Primary, secondary, and utility hierarchy remains identifiable under the squint test.
- Existing navigation callbacks, API polling, chart behavior, empty states, and guided-tour targets remain functional.
- Vitest, ESLint, TypeScript/Vite build, layout detector, and responsive browser checks pass.

## Out of Scope

- Migrating from Vite to Next.js.
- Changing backend endpoints or data contracts.
- Redesigning other destinations beyond shared header behavior required by this page.
- Adding fabricated metrics, live data, or competition claims.
