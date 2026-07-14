# Archive Evidence Ledger Design

## Goal

Turn Archive into GoalPulse's permanent evidence ledger: fast to search, easy to scan, honest about missing data, and visually continuous with the signal-first Command Center.

## Chosen direction

Use a ledger-first composition instead of a card gallery or chronological timeline. Historical review is a comparison task, so stable columns, compact filters, and clear outcomes are more useful than individually decorated records.

## Information architecture

1. A compact page introduction states permanence and audit purpose without oversized hero treatment.
2. The primary ledger owns search, status, market, event, result count, loading, error, empty, and pagination states.
3. Desktop uses a semantic table with columns for fixture, signal, movement, confidence, outcome, and archived time.
4. Mobile uses task-ordered record buttons that preserve the same evidence and open the existing audit drawer.
5. Signal performance and confidence calibration sit in a balanced two-column supporting-analysis region.
6. Verified case studies remain last because they are pinned examples, not the full record.

## Visual system

- Preserve the existing canvas, surfaces, amber action color, and semantic result colors.
- Use dividers and row states instead of nested cards.
- Keep Inter for UI, JetBrains Mono for values, and Space Grotesk only for the page title.
- Signature element: a quiet vertical result marker inside each ledger row, semantic rather than decorative.
- Minimum interactive height is 44px. Muted body copy uses stone-400 or stronger.

## Interaction and states

- Search is debounced and labeled for assistive technology.
- Filters are standard selects on narrow screens and remain compact at desktop width.
- A visible Clear filters action appears only when filters differ from defaults.
- Loading uses row skeletons, not a centered spinner.
- Fetch failure clears stale entries, names the problem, and offers Retry.
- Empty results distinguish an empty permanent archive from filters returning no matches.
- Pagination reports the visible record range and disables boundary actions.

## Responsive behavior

- At desktop widths, the ledger is a table with aligned numeric columns.
- Below the large breakpoint, table headers are removed and records become stacked buttons so tablet content is not compressed into seven narrow columns.
- The filter toolbar wraps without horizontal scrolling.
- Supporting analysis changes from two columns to one.

## Acceptance criteria

- Existing audit drawer mapping remains intact.
- Filters generate the same API query contract and reset pagination.
- Non-2xx and rejected fetches show a recoverable error without stale records.
- Desktop and mobile expose equivalent evidence.
- No horizontal overflow at 320px, 390px, 768px, 1024px, or 1440px.
- Full tests, lint, build, and UI detector pass before publishing.
