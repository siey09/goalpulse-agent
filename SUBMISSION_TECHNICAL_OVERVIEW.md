# GoalPulse — Brief Technical Documentation

## Core idea

GoalPulse is an autonomous, analytics-only market intelligence agent powered by TxLINE. It monitors live football odds and score events, detects significant price movement, connects that movement with match context and data reliability, and produces an explainable signal. When a fixture finishes, GoalPulse audits the signal against the real outcome and preserves the evidence for replay and verification.

The system does not place wagers, execute trades, connect to betting accounts, or custody funds.

## Business highlights

- **Problem:** odds movement alone does not explain whether a move reflects real match pressure, unreliable data, or market noise.
- **Users:** sports-market operators, analysts, data teams, and integrity or research workflows that need faster, reviewable market monitoring.
- **Value:** reduces manual monitoring by turning raw odds and score updates into prioritized signals with visible reasoning, source identifiers, and outcome audits.
- **Differentiation:** GoalPulse is not a black-box match predictor. Its thresholds, formulas, reliability warnings, evidence references, and rejected outcomes remain visible.
- **Safety boundary:** the product provides analytical quotes and simulated strategy testing only; no funds or wagers move.

## Technical highlights

- Autonomous Node.js and TypeScript agent cycles ingest TxLINE fixtures, odds, and TXODDS Scores context.
- Deterministic signal logic measures consecutive odds compression and classifies severity using transparent thresholds.
- A Field Pressure Index maps score events such as goals, shots, penalties, cards, VAR activity, and dangerous possession into supporting context.
- Reliability and freshness checks reduce confidence or label a signal `market-only` when field evidence is missing or stale.
- Finished fixtures automatically settle signals as correct or incorrect and update the strategy audit.
- Replay Lab reruns stored real TxLINE evidence through the same deterministic engine for repeatable inspection.
- Insert-only archives preserve signals and finished-match records independently from the bounded live store.
- Live health monitoring exposes polling coverage, odds freshness, autonomous-cycle status, and both TxLINE SSE connections.
- TxLINE stat proof data can be validated through a read-only Solana Merkle-proof flow; a separate local SHA-256 fingerprint provides tamper-evident comparison, not an on-chain claim.

## Data flow

`TxLINE fixtures + odds + scores → normalized snapshots → movement and context checks → explainable signal → strategy evaluation → final-outcome audit → archive and verification`

## TxLINE endpoints used

| Method | Endpoint | Purpose in GoalPulse |
| --- | --- | --- |
| `POST` | `/auth/guest/start` | Obtains the short-lived guest JWT used with the TxLINE API token. |
| `GET` | `/api/fixtures/snapshot` | Discovers current fixtures and their lifecycle state. |
| `GET` | `/api/odds/snapshot/{fixtureId}` | Reads the latest de-margined 1X2 and totals prices. |
| `GET` | `/api/odds/updates/{fixtureId}` | Loads chronological odds updates used to measure movement. |
| `GET` | `/api/odds/stream` | Observes live odds SSE connectivity and freshness. |
| `GET` | `/api/scores/snapshot/{fixtureId}` | Enriches a fixture with current score, status, clock, events, and reliability context. |
| `GET` | `/api/scores/historical/{fixtureId}` | Retrieves eligible historical score-event sequences for finished-fixture audits and replay context. |
| `GET` | `/api/scores/stream` | Observes live Scores SSE connectivity, reconnections, and stale periods. |
| `GET` | `/api/scores/stat-validation` | Retrieves the fixture, sequence, stat, and Merkle-proof data used by the read-only Solana validator. |

Authenticated TxLINE requests send the guest bearer JWT together with the provided `X-Api-Token`. Secrets remain server-side and are never bundled into the frontend.

## Implementation and deployment

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, and Recharts on Vercel.
- **Backend:** Node.js, Express, and TypeScript on Render.
- **Persistence:** bounded in-memory live state with optional Supabase restart recovery and insert-only archives.
- **Verification:** local SHA-256 audit fingerprints plus read-only Solana mainnet Merkle-proof validation where TxLINE proof data is available.
- **Quality:** deterministic logic is covered by Vitest suites and GitHub Actions CI.

## Known limitations

- Field context depends on the coverage and timing available for each TxLINE fixture.
- Odds and Scores events may arrive at different times, so GoalPulse surfaces freshness and reliability instead of implying certainty.
- Strategy results are simulated and remain provisional when too few positions or distinct fixtures have settled.
- Free-tier hosting can introduce cold-start latency.

## Links

- Live MVP: https://goalpulse-agent.vercel.app/
- Demo video: https://www.youtube.com/watch?v=julntqJjWfo
- Full technical documentation: https://github.com/siey09/goalpulse-agent/blob/main/TECHNICAL_DOCS.md
- Interactive API documentation: https://goalpulse-agent-api.onrender.com/api/docs
