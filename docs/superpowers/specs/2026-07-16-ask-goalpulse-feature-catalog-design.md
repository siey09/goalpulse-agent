# Ask GoalPulse Feature Catalog Design

## Goal

Turn Ask GoalPulse into a judge-friendly, deterministic product guide. Entering `/features` must reveal the product's implemented capabilities, while selecting or naming a feature must explain what it does, how GoalPulse implements it, the exact formulas or thresholds it uses, and its honest limits.

## Product decision

Use a structured local catalog rather than a generated answer or one long static paragraph. The first `/features` response is a compact, grouped index. A user can select a feature card or enter `/features <name>` to see the detailed explanation. This gives judges breadth first and technical depth on demand without flooding the chat.

The catalog is deterministic and ships with the frontend. It makes no LLM request, adds no paid dependency, and does not create a new backend endpoint. Existing live-data questions continue to use the existing GoalPulse API routes.

## Interaction model

- `/features` displays all catalog entries grouped into `Live intelligence`, `Strategy`, `Trust & verification`, and `Operations`.
- `/features <name>` displays one feature detail, with aliases supporting natural terms such as `confidence`, `kelly`, `steam`, `solana`, and `market maker`.
- `/help` displays the supported commands and reminds users that ordinary live-data questions still work.
- Feature cards are real buttons. Selecting one sends the corresponding feature command without forcing the user to type it.
- Unknown feature names return a concise recovery message and the valid feature labels.
- The chat input hints at `/features`; the empty state exposes command chips so the feature is discoverable.

## Catalog content and evidence rules

Each feature entry contains a stable id, aliases, category, short summary, implementation steps, formula or deterministic rule lines, data source, and limitation. Initial coverage includes:

1. Live Markets and odds movement
2. Signal Detection and severity thresholds
3. Composite Confidence Score
4. Field Pressure and reliability context
5. Steam Move Detection
6. Signal Correlation
7. Outcome Audit and reversal detection
8. Agent Arena
9. Kelly Criterion sizing
10. In-Play Market Maker
11. Replay Lab
12. Signal Archive and historical matching
13. Solana Verification and local audit fingerprint boundary
14. System Health
15. Discord alerts and community

Formula text must mirror production source behavior. Examples include:

- Odds compression: `((odds before - odds after) / odds before) × 100`
- Implied probability: `(1 / decimal odds) × 100`
- Probability-point shift: `(1 / odds after - 1 / odds before) × 100`
- Severity: LOW at 4%, MEDIUM at 8%, HIGH at 15%
- Confidence: a weighted blend of normalized movement magnitude (0.5), field pressure (0.3), and freshness tightness (0.2), renormalized when field context is unavailable; odds at or above 3.0 apply the archived-data-derived 0.3 longshot factor
- Steam: at least three consecutive moves of at least 1% each within five minutes
- Kelly: market implied probability plus confidence-scaled edge capped at 15%; raw Kelly fraction `(b×p-q)/b`; reject above the 20% risk limit; accepted fraction scaled to a 10-unit comparison bankroll
- ROI: `(net units / total units staked) × 100`
- Market-maker spread: `clamp(2 + pressure/45×6 + reliability penalty, 2, 20)`, with a 4-point unreliable or 8-point suspended penalty

No catalog entry may claim functionality that the repository does not implement. Limitations must distinguish analytics from betting advice, local SHA-256 fingerprints from independently verifiable Solana proofs, live data from demo replay, and proxy metrics from direct measurements.

## Architecture

Create `apps/web/src/lib/goalPulseFeatureCatalog.ts` as the single source of truth. It owns catalog data, category metadata, alias lookup, slash-command parsing, and structured reply creation. This keeps knowledge content out of the already-large `App.tsx`.

Extend the existing chat message contract with optional structured payloads:

- `kind: "text"` for existing analyst answers
- `kind: "feature-index"` with catalog ids
- `kind: "feature-detail"` with one catalog id
- `kind: "help"` for command guidance

`App.tsx` routes deterministic slash commands before the existing live-data intent matching. `AnalystChatWidget.tsx` renders structured messages with semantic buttons, compact sections, readable formulas, and keyboard-safe interactions. The widget receives an `onCommand` callback so card selection follows the same send path as typed commands.

## Visual direction

Preserve GoalPulse's dark command-center language. The index uses compact category headers and two-column feature buttons where space allows. Detail responses use a strong title, one-sentence purpose, a numbered implementation flow, a visually distinct formula block, and small source/limitation rows. Density should feel technical but scannable, with no decorative chart or animation that competes with the explanation.

## Accessibility and safety

- Use buttons for interactive cards and maintain visible focus states.
- Announce the reply stream with an accessible live region.
- Keep formula characters as text; never render catalog content as HTML.
- Preserve Enter-to-send behavior and disabled states.
- Respect the existing narrow-screen width and scrolling behavior.

## Verification

- Unit-test command parsing, aliases, unknown-feature recovery, catalog uniqueness, and required evidence fields.
- Component-test the index, detail content, click-to-command behavior, and `/help` output.
- Run the full web test suite, lint, and production build.
- Perform a production-like browser check at desktop and narrow mobile widths before deployment.
