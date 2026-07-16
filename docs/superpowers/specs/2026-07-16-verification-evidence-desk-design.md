# Verification Evidence Desk Design

## Goal

Turn the sparse Verification Objects destination into a judge-readable evidence workspace where an operator can choose a recent signal, understand exactly what can and cannot be verified, and run the existing Solana mainnet validation without leaving the page.

The upgrade must remain low-cost: reuse current React state and the existing validation action, add no endpoint, polling loop, dependency, persistence, or fabricated proof claim.

## Chosen Direction

Build a **Verification Evidence Desk** rather than merely restyling the two current cards.

Two alternatives were rejected:

- A cosmetic cleanup would improve spacing but leave the page functionally empty and weak for judges.
- A new backend audit registry would add infrastructure and request volume without improving the immediate verification flow enough to justify the cost.

## Information Architecture

The page has four layers:

1. **Evidence desk header** — states the page's job and shows compact counts for visible objects, on-chain-eligible objects, local fingerprints, and objects verified in the current session.
2. **Verification object queue** — lists the existing recent live and replay objects with match, target/type, source, timestamp, and an honest readiness status.
3. **Selected proof inspector** — shows the selected object's identity and a vertical proof chain: source record, signal decision, TxLINE fixture/stat sequence, and Solana validation result. The existing verification action lives at the end of this chain.
4. **Trust model reference** — compresses the current long explainer into progressively disclosed definitions for local fingerprint, Solana validation, simulation receipt, and unavailable proof.

Desktop uses a four-column queue beside an eight-column inspector. Mobile stacks the queue above the inspector. No panel uses a fixed viewport height.

## Visual Direction

The subject is a forensic market-evidence workstation for judges and technical operators. It retains GoalPulse's dark command-center palette and existing display/body/mono typography.

The memorable element is a **proof rail**: a vertical, connected sequence of evidence nodes. Each node encodes a real boundary in the verification process rather than serving as decoration.

Use existing tokens only:

- surface black and slate for the ledger base
- proof violet for proof identity and local fingerprints
- info cyan for actionable mainnet verification
- positive green for validated evidence
- warning/danger only for explicit unavailable or failed evidence

Motion is limited to selection, button, and proof-state transitions and respects reduced-motion preferences.

## Data and Component Boundaries

`App.tsx` passes the already-computed `outcomeVerificationItems` plus `setSelectedSignal` into `VerificationPage`.

The page owns no network state. It receives:

- verification objects: signal, source, optional local proof hash
- selected signal
- current on-chain verification map
- select and verify callbacks

A pure `verificationWorkspaceModel` module derives object readiness, summary counts, selected-object metadata, and proof-chain state. This keeps truth semantics testable outside React.

UI boundaries:

- `VerificationObjectQueue` renders and selects objects.
- `VerificationEvidenceChain` renders the selected object's evidence nodes.
- `VerificationReceipt` gains a workspace presentation variant while keeping its current compact default for Replay Lab and audit drawers.
- `VerificationPage` composes the workspace and trust reference.

If no signal is selected, the first visible object is inspected as a useful default without mutating global selection. If no objects exist, the page explains that verification objects appear after live or replay signals are generated.

## Truth and Failure Semantics

Statuses are derived only from available evidence:

- **Verified** — validation is available and valid.
- **Failed** — validation is available and invalid.
- **Unavailable** — the endpoint returned a concrete unavailable reason.
- **Ready** — fixture and TXODDS sequence exist but validation has not run.
- **No sequence** — the signal lacks the exact sequence needed for validation.

A local SHA-256 fingerprint is never described as posted to Solana. A replay simulation receipt is never described as a real trade. Missing evidence always shows the specific missing boundary.

## Accessibility and Responsiveness

- Queue objects are native buttons with visible focus states and selected semantics.
- Status is not communicated by color alone.
- Verification loading/results use existing live state and readable text.
- Long hashes, IDs, and match names wrap or truncate with accessible labels.
- Touch targets are at least 44px.
- Proof transitions disable under reduced-motion preferences.

## Verification

Add tests for:

- pure readiness and summary derivation across ready, verified, failed, unavailable, and no-sequence objects
- defaulting the inspector to the first object without fabricating selection
- selecting a queue item
- displaying source, fixture, sequence, local fingerprint, and explicit unavailable states
- preserving compact `VerificationReceipt` behavior while rendering the richer workspace variant
- responsive structure, keyboard semantics, and absence of mojibake in new copy

Run the full web test suite, lint, TypeScript build, Vite production build, and `git diff --check`. After merge, verify the production destination and existing Replay Lab receipt remain functional.
