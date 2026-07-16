# Verification Proof Boundary Note

## Objective

Make the Verification Evidence Desk explain why some signals cannot be checked on-chain without implying a GoalPulse system failure or overstating what the product can prove.

## Approved design

Add one always-visible informational note immediately below the **Trust model** heading and above the four trust-definition disclosures.

Copy:

> On-chain verification requires an exact TxLINE event sequence from the upstream feed. When that sequence is unavailable, GoalPulse preserves the signal but does not invent or infer a proof.

The note uses the existing proof color family, a compact bordered surface, and a small shield icon. It remains visually subordinate to the selected proof inspector and does not introduce a modal, toast, animation, or new interaction.

## Behavior and data

- The note is static explanatory copy; it does not claim that an unavailable signal is verified.
- Existing verification statuses, eligibility rules, Solana checks, and disabled-button behavior remain unchanged.
- No endpoint, polling loop, dependency, storage, or telemetry is added.
- The copy identifies the upstream data boundary while emphasizing GoalPulse's non-fabrication policy.

## Accessibility and responsive behavior

- Render the explanation as ordinary readable text inside a semantic note region.
- Keep the icon decorative so screen readers announce the explanation only once.
- Allow the copy to wrap naturally on narrow screens without horizontal overflow.
- Preserve the existing Trust model disclosures and keyboard behavior.

## Verification

- Add a component test that fails until the exact proof-boundary explanation is present and exposed as a note.
- Run the focused Verification page tests, then the web test suite, lint, TypeScript, and production build.
- Inspect the deployed Verification page for readable wrapping, no overflow, and no console errors.

## Out of scope

- Reconstructing missing TxLINE sequences.
- Changing signal ingestion or on-chain eligibility.
- Presenting simulated or inferred evidence as a Solana proof.
