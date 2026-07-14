# Signals Triage Workspace Design

## Outcome

Replace the vertically stacked Signals page with an operator-first triage workspace that makes the newest and highest-risk market signals easy to scan, compare, and inspect without losing GoalPulse's verification story.

## Chosen direction

Use a dense signal queue as the primary surface. The queue is more appropriate than a card feed or kanban board because signals are time-sensitive records with repeated fields that operators compare across rows. A compact context rail carries live pattern scanners; the deeper explainability panel remains available below the primary workflow.

## Information hierarchy

1. Page heading and honest queue status.
2. Compact summary strip: visible signals, high severity, field-backed signals, and proof coverage.
3. Search and status filters.
4. Signal queue with match, target, severity, odds movement, confidence, field evidence, outcome, proof state, timestamp, and an explicit inspect action.
5. Live pattern rail containing steam-move and correlation scanners.
6. Explainability section for the current best TxLINE signal.

## Interaction and states

- Search matches fixture, target, signal type, and source.
- Status filters are mutually exclusive: All, High priority, Field-backed, and Settled.
- Each visible signal has a full-size Inspect signal control that opens the existing audit drawer through `onSelectSignal`.
- Empty input explains that GoalPulse is waiting for a signal or replay rather than fabricating data.
- A filtered empty state explains that no records match and provides a 44px Clear filters action.
- Desktop uses a queue plus context rail. Mobile converts each queue row into a readable stacked record with no horizontal scrolling.

## Visual system

- Preserve the instrument-console palette and typography already used by Command Center and Archive.
- Amber identifies operator attention and primary actions; red is reserved for high severity; teal identifies field evidence; violet identifies proof coverage.
- Use separators and tonal rows instead of nested cards.
- Signature element: a thin evidence rail inside every signal row that reads market movement, field context, and proof as one left-to-right decision chain.

## Accessibility and quality

- One `h1`; labeled regions for queue, live pattern scan, and explainability.
- Informative text uses stone-400 or stronger.
- Every control is at least 44px high, keyboard reachable, and has a visible focus style.
- Results count is announced with `aria-live="polite"`.
- No horizontal page overflow at 320px, 390px, or desktop widths.
- No new dependencies.

