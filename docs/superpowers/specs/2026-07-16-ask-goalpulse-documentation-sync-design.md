# Ask GoalPulse Documentation Sync Design

## Goal

Bring every necessary public and developer-facing document in line with the deployed deterministic Ask GoalPulse feature guide without rewriting unrelated documentation.

## Scope

Update four documents:

- `README.md`: accurately summarize the 15-feature catalog, `/features`, `/features <name>`, `/help`, clickable explanations, and the zero-LLM boundary.
- `TECHNICAL_DOCS.md`: document the typed catalog module, structured reply types, local-first command routing, UI rendering contract, and test files.
- `DEMO_CHECKLIST.md`: add a short judge-facing demonstration (`/features` → Composite Confidence → Solana Verification), update the final demo order, and add production verification checks.
- `apps/web/README.md`: replace the stale minimal dashboard list and machine-specific local paths with current destinations, Ask GoalPulse commands, important files, portable commands, tests, lint, and build steps.

Do not change `openapi.yaml`: Ask GoalPulse's knowledge commands are frontend-only and add no HTTP endpoint. Do not duplicate all 15 catalog entries in Markdown; the typed catalog remains the canonical feature-level source so formulas cannot drift across multiple documents.

## Accuracy rules

- State that slash commands are deterministic and handled locally before live-data intent routing.
- State that ordinary live questions can still call existing GoalPulse API endpoints.
- State that formulas and limitations are stored in `goalPulseFeatureCatalog.ts` and mirror production logic.
- Keep the analytics-only boundary explicit.
- Describe Solana mainnet proof validation separately from the local SHA-256 fingerprint.
- Do not claim a feature count other than the tested catalog count of 15.

## Validation

- Search all Markdown files for stale Ask GoalPulse descriptions and machine-specific `C:\Projects\goalpulse-agent` paths.
- Confirm every documented command exists in the parser tests.
- Run web tests because documentation cites tested command behavior and catalog count.
- Run Markdown whitespace checks and inspect the final diff for unrelated edits.
