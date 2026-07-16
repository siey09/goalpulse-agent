# Proof-Ready Verification Queue

## Objective

Ensure the Verification Evidence Desk surfaces real Solana-eligible signals already present in the existing `/api/signals` response instead of hiding them behind the four newest records.

## Evidence and root cause

- Production currently returns 100 real TxLINE signals; 21 include both a fixture ID and an exact Scores event sequence.
- A read-only validation of fixture `18241006`, sequence `936`, stat key `1002` returned `available: true` and `isValid: true`.
- The web app currently maps only `signals.slice(0, 4)` into verification objects. The four newest records have no sequence, so the page reports zero eligible objects even though eligible records exist later in the same response.

## Approved design

Build verification objects from all already-loaded live and replay signals, remove duplicate signal IDs, rank them without mutating source arrays, and display at most five:

1. Signals with an explicit fixture ID and exact Scores sequence.
2. Signals with a local replay fingerprint.
3. Remaining signals in their existing newest-first order.

The first ranked object remains the default selection. Therefore, when any eligible signal exists, the selected proof inspector opens with a real `Verify on Solana` action. Non-eligible records continue to show `No sequence` honestly.

## Architecture

- Add a pure `buildVerificationObjects` function to the verification workspace model.
- Keep ranking, deduplication, and the five-object cap inside that tested model rather than in `App.tsx`.
- Replace the inline `signals.slice(0, 4)` assembly in `App.tsx` with the pure function.
- Reuse the existing signal response, verifier endpoint, status derivation, queue, and receipt components.

## Constraints

- No new API request, polling interval, dependency, persistence, or fabricated proof.
- Do not alter Solana validation behavior or assign a human-readable meaning to undocumented stat key `1002`.
- Preserve stable ordering within each priority group.
- Prefer replay objects when duplicate signal IDs exist because they may carry a local fingerprint.
- Keep the current five-object density.

## Verification

- Unit-test eligible-first ordering, stable fallback ordering, replay fingerprint priority, duplicate removal, immutability, and the five-object cap.
- Run the verification model tests, full web tests, lint, TypeScript, and production build.
- On production, confirm at least one eligible object appears first, the Verify button is enabled, a real validation returns proof state, no horizontal overflow exists, and the console is error-free.
