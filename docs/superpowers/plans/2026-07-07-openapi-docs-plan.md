# OpenAPI (Swagger) Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hand-written `openapi.yaml` at the repo root documenting all 13 backend endpoints exactly as they currently behave, served live via an interactive Swagger UI at `GET /api/docs`.

**Architecture:** A static OpenAPI 3.0.3 YAML file at the repo root, loaded at server startup with `yamljs` and rendered by `swagger-ui-express` on a new `GET /api/docs` route in `server.ts`. No existing route's behavior changes.

**Tech Stack:** `swagger-ui-express`, `yamljs` (plus their `@types/` packages), matching this project's existing strict-TypeScript convention.

## Global Constraints

- Documentation only — no existing endpoint's behavior may change (spec: "Problem").
- `GET /api/docs` must stay public (no `requireApiKey`), exactly like every other GET route (spec: "Confirmed behavior").
- All schemas must reflect real, already-observed current behavior — no invented or idealized fields (spec: "Design", "File and content").
- `POST /api/agent/run-once`'s OpenAPI operation must declare the `apiKeyAuth` security scheme and document both its `401` and its endpoint-specific `429` (spec: "Auth and rate limits").
- The general 1200/min rate limit is documented once at the API level; every endpoint also references the shared `429` response (spec: "Auth and rate limits").
- No automated test for the YAML content itself — verification is an OpenAPI linter plus manual Swagger UI interaction (spec: "Testing / verification").

---

### Task 1: Write and validate the OpenAPI spec

**Files:**
- Create: `C:\Projects\goalpulse-agent\openapi.yaml`

**Interfaces:**
- Produces: a valid OpenAPI 3.0.3 document at the repo root. Task 2 loads this file by path (`../../../openapi.yaml` relative to `apps/api/src/server.ts`, which resolves to the repo root in both dev (`tsx` running `src/server.ts`) and production (`node` running the compiled `dist/server.js`), since `src` and `dist` are sibling directories at the same depth under `apps/api`).

- [ ] **Step 1: Write the complete OpenAPI spec**

Create `C:\Projects\goalpulse-agent\openapi.yaml` with this exact content:

```yaml
openapi: 3.0.3
info:
  title: GoalPulse Agent API
  description: >
    Autonomous TxLINE-powered sports market intelligence API. Detects odds
    movement, enriches signals with TXODDS Scores context, and audits
    settlement outcomes against real match results.


    All endpoints are rate-limited to 1200 requests/minute per IP. Exceeding
    this limit returns `429` with `{ "error": "Too many requests. Please
    slow down and try again shortly." }`. `POST /api/agent/run-once` has an
    additional, stricter 10 requests/minute limit and requires the
    `X-API-Key` header.
  version: 1.0.0
servers:
  - url: https://goalpulse-agent-api.onrender.com
    description: Production (Render)
  - url: http://localhost:4000
    description: Local development

components:
  securitySchemes:
    apiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
      description: >
        Required only for POST /api/agent/run-once. Configured via the
        API_ACCESS_KEY environment variable on the server. If the server has
        no key configured, this endpoint always rejects (fail-closed).

  schemas:
    Match:
      type: object
      properties:
        id: { type: string }
        competition: { type: string }
        homeTeam: { type: string }
        awayTeam: { type: string }
        homeScore: { type: number }
        awayScore: { type: number }
        minute: { type: number }
        status: { type: string, enum: [scheduled, live, finished] }
        statusId: { type: number }
        statusLabel: { type: string }
        clockSeconds: { type: number }
        clockLabel: { type: string }
        lastUpdated: { type: string, format: date-time }
      required: [id, competition, homeTeam, awayTeam, homeScore, awayScore, minute, status, lastUpdated]

    TxLineScoreBreakdown:
      type: object
      properties:
        h1: { type: string }
        h2: { type: string }
        total: { type: string }
        goals: { type: string }
        corners: { type: string }
        redCards: { type: string }
        yellowCards: { type: string }

    TxLineScoresContext:
      type: object
      properties:
        fixtureId: { type: string }
        endpointUsed: { type: string }
        latestAction: { type: string }
        actionLabel: { type: string }
        actionTeam: { type: string, enum: [home, away, neutral, unknown] }
        statusId: { type: number }
        statusName: { type: string }
        clockSeconds: { type: number }
        minute: { type: number }
        homeScore: { type: number }
        awayScore: { type: number }
        scoreline: { type: string }
        scoreBreakdown:
          $ref: '#/components/schemas/TxLineScoreBreakdown'
        possessionType: { type: string }
        pressureLevel: { type: string, enum: [NONE, SAFE, ATTACK, DANGER, HIGH_DANGER] }
        fieldPressureScore: { type: number }
        reliability: { type: string, enum: [RELIABLE, UNRELIABLE, SUSPENDED, UNKNOWN] }
        reliabilityReason: { type: string }
        confirmed: { type: boolean }
        sequence: { type: number }
        timestamp: { type: string, format: date-time }
        proofLabel: { type: string }

    TxLineEvidence:
      type: object
      properties:
        source: { type: string, enum: [txline, simulated_txline] }
        fixtureId: { type: string }
        endpointUsed: { type: string }
        bookmaker: { type: string }
        messageId: { type: string }
        marketType: { type: string }
        marketPeriod: { type: string, nullable: true }
        marketParameters: { type: string, nullable: true }
        previousSnapshotId: { type: string }
        currentSnapshotId: { type: string }
        previousTimestamp: { type: string, format: date-time }
        currentTimestamp: { type: string, format: date-time }
        scoresContext:
          $ref: '#/components/schemas/TxLineScoresContext'
        proofLabel: { type: string }
      required: [source]

    OddsSnapshot:
      type: object
      properties:
        id: { type: string }
        matchId: { type: string }
        homeTeam: { type: string }
        awayTeam: { type: string }
        homeOdds: { type: number }
        awayOdds: { type: number }
        drawOdds: { type: number }
        homeScore: { type: number }
        awayScore: { type: number }
        minute: { type: number }
        source: { type: string, enum: [simulated_txline, txline] }
        createdAt: { type: string, format: date-time }
        matchLabel: { type: string }
        evidence:
          $ref: '#/components/schemas/TxLineEvidence'
      required: [id, matchId, homeTeam, awayTeam, homeOdds, awayOdds, drawOdds, homeScore, awayScore, minute, source, createdAt]

    AgentSignal:
      type: object
      properties:
        id: { type: string }
        matchId: { type: string }
        match: { type: string }
        target: { type: string }
        side: { type: string, enum: [home, away] }
        signalType: { type: string, enum: [SHARP_MOVE, WATCH, MOMENTUM_SHIFT, NO_ACTION] }
        severity: { type: string, enum: [HIGH, MEDIUM, LOW, NONE] }
        oddsBefore: { type: number }
        oddsAfter: { type: number }
        oddsChangePct: { type: number }
        momentumScore: { type: number }
        explanation: { type: string }
        createdAt: { type: string, format: date-time }
        resultStatus: { type: string, enum: [pending, correct, incorrect] }
        evidence:
          $ref: '#/components/schemas/TxLineEvidence'
        discordAlertStatus: { type: string, enum: [sent, failed, not_configured] }
      required: [id, matchId, match, target, side, signalType, severity, oddsBefore, oddsAfter, oddsChangePct, momentumScore, explanation, createdAt, resultStatus]

    AgentRun:
      type: object
      properties:
        id: { type: string }
        startedAt: { type: string, format: date-time }
        finishedAt: { type: string, format: date-time }
        matchesProcessed: { type: number }
        snapshotsCreated: { type: number }
        signalsCreated: { type: number }
        status: { type: string, enum: [success, error] }
        message: { type: string }
      required: [id, startedAt, finishedAt, matchesProcessed, snapshotsCreated, signalsCreated, status, message]

    LiveStreamState:
      type: object
      properties:
        connected: { type: boolean }
        lastEventAt: { type: string, format: date-time, nullable: true }
        totalEventsReceived: { type: number }
        totalReconnects: { type: number }
        lastError: { type: string, nullable: true }
      required: [connected, lastEventAt, totalEventsReceived, totalReconnects, lastError]

    Stats:
      type: object
      properties:
        txlineUpdates: { type: number }
        signalsGenerated: { type: number }
        highSeverity: { type: number }
        pendingSignals: { type: number }
        correctSignals: { type: number }
        incorrectSignals: { type: number }
        closedSignals: { type: number }
        strategyAccuracy: { type: number }
        lastAgentRun:
          nullable: true
          allOf:
            - $ref: '#/components/schemas/AgentRun'
      required: [txlineUpdates, signalsGenerated, highSeverity, pendingSignals, correctSignals, incorrectSignals, closedSignals, strategyAccuracy, lastAgentRun]

    PnlSeverityBreakdown:
      type: object
      properties:
        severity: { type: string }
        bets: { type: number }
        netUnits: { type: number }
        roiPercent: { type: number }
      required: [severity, bets, netUnits, roiPercent]

    PnlSummary:
      type: object
      properties:
        unitStake: { type: number }
        settledBets: { type: number }
        totalStaked: { type: number }
        netUnits: { type: number }
        roiPercent: { type: number }
        openPositions: { type: number }
        openExposure: { type: number }
        bySeverity:
          type: array
          items:
            $ref: '#/components/schemas/PnlSeverityBreakdown'
        note: { type: string }
      required: [unitStake, settledBets, totalStaked, netUnits, roiPercent, openPositions, openExposure, bySeverity, note]

    ProvenStat:
      type: object
      properties:
        key: { type: number }
        value: { type: number }
        period: { type: number }
      required: [key, value, period]

    OnChainValidationResult:
      type: object
      properties:
        available: { type: boolean }
        reason: { type: string }
        isValid: { type: boolean }
        provenStat:
          $ref: '#/components/schemas/ProvenStat'
        dailyScoresPda: { type: string }
      required: [available]

    ErrorResponse:
      type: object
      properties:
        error: { type: string }
      required: [error]

    ReplayTimelineStep:
      type: object
      properties:
        step: { type: string }
        detail: { type: string }
      required: [step, detail]

    ReplayEvent:
      type: object
      properties:
        id: { type: string }
        matchId: { type: string }
        minute: { type: number }
        team: { type: string }
        type: { type: string }
        description: { type: string }
        createdAt: { type: string, format: date-time }
      required: [id, matchId, minute, team, type, description, createdAt]

    ReplaySignal:
      allOf:
        - $ref: '#/components/schemas/AgentSignal'
        - type: object
          properties:
            trapStatus: { type: string, enum: [WATCHING, VALIDATED_MOVE, CONFIRMED_TRAP, POSSIBLE_TRAP, LOW_TRAP_RISK] }
            trapScore: { type: number }
            trapReason: { type: string }
            reversalRisk: { type: string, enum: [OVEREXTENDED_WATCH, NORMAL_WATCH, VALIDATED, EXTREME_REVERSAL, HIGH_REVERSAL, MODERATE_REVERSAL, LOW_REVERSAL] }
            reversalReason: { type: string }
            finalScore: { type: string }
            scoreRealityStatus: { type: string, enum: [WAITING_FOR_FINAL_SCORE, CONFIRMED_BY_SCORE, REJECTED_BY_SCORE] }
            scoreRealityReason: { type: string }
          required: [trapStatus, trapScore, trapReason, reversalRisk, reversalReason, finalScore, scoreRealityStatus, scoreRealityReason]

    CouncilVote:
      type: object
      properties:
        agent: { type: string }
        vote: { type: string, enum: [approve, reject, watch] }
        reason: { type: string }
      required: [agent, vote, reason]

    CouncilDecision:
      type: object
      properties:
        signalId: { type: string }
        matchId: { type: string }
        target: { type: string }
        decision: { type: string, enum: [approved, watch, rejected] }
        approvals: { type: number }
        totalAgents: { type: number }
        votes:
          type: array
          items:
            $ref: '#/components/schemas/CouncilVote'
      required: [signalId, matchId, target, decision, approvals, totalAgents, votes]

    ReplayProof:
      type: object
      properties:
        type: { type: string, enum: [sha256] }
        hash: { type: string }
        network: { type: string, enum: [solana-devnet] }
        anchoringStatus: { type: string, enum: [ready_to_anchor, pending_wallet_configuration] }
        walletConfigured: { type: boolean }
        transactionSignature: { type: string, nullable: true }
        explorerUrl: { type: string, nullable: true }
        note: { type: string }
      required: [type, hash, network, anchoringStatus, walletConfigured, transactionSignature, explorerUrl, note]

    ReplaySummary:
      type: object
      properties:
        snapshotsProcessed: { type: number }
        signalsDetected: { type: number }
        correctSignals: { type: number }
        incorrectSignals: { type: number }
        accuracyPct: { type: number }
        smartMoneyTraps: { type: number }
        confirmedTraps: { type: number }
        possibleTraps: { type: number }
      required: [snapshotsProcessed, signalsDetected, correctSignals, incorrectSignals, accuracyPct, smartMoneyTraps, confirmedTraps, possibleTraps]

    ReplayBacktest:
      type: object
      properties:
        datasetId: { type: string }
        mode: { type: string, enum: [real_txline_replay, historical_replay] }
        status: { type: string, enum: [completed] }
        summary:
          $ref: '#/components/schemas/ReplaySummary'
        timeline:
          type: array
          items:
            $ref: '#/components/schemas/ReplayTimelineStep'
        snapshots:
          type: array
          items:
            $ref: '#/components/schemas/OddsSnapshot'
        events:
          type: array
          items:
            $ref: '#/components/schemas/ReplayEvent'
        signals:
          type: array
          items:
            $ref: '#/components/schemas/ReplaySignal'
        councilVotes:
          type: array
          items:
            $ref: '#/components/schemas/CouncilDecision'
        proof:
          $ref: '#/components/schemas/ReplayProof'
      required: [datasetId, mode, status, summary, timeline, snapshots, events, signals, councilVotes, proof]

    OddsStreamEvent:
      type: object
      properties:
        matchId: { type: string }
        timestamp: { type: string, format: date-time }
        match:
          $ref: '#/components/schemas/Match'
        latestSnapshot:
          $ref: '#/components/schemas/OddsSnapshot'
        history:
          type: array
          items:
            $ref: '#/components/schemas/OddsSnapshot'
        signals:
          type: array
          items:
            $ref: '#/components/schemas/AgentSignal'
        stats:
          $ref: '#/components/schemas/Stats'
        streamMode: { type: string, enum: [replay_test] }
        replayCursor: { type: number }
        replayTotal: { type: number }
        replayComplete: { type: boolean }
      required: [matchId, timestamp, history, signals, stats]

  responses:
    RateLimited:
      description: Too many requests — general 1200/min per-IP limit exceeded.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error: "Too many requests. Please slow down and try again shortly."

paths:
  /health:
    get:
      summary: Health check and live-stream connectivity status
      description: >
        Returns service status, agent configuration, and TxLINE push-stream
        connectivity state. Used by UptimeRobot for external monitoring
        (every 5 minutes) and by Render's own health check.
      responses:
        '200':
          description: Service is healthy.
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean, enum: [true] }
                  service: { type: string, enum: ["GoalPulse Agent API"] }
                  status: { type: string, enum: [running] }
                  agentIntervalMs: { type: number }
                  useSimulatedFeed: { type: boolean }
                  txlineBaseUrl: { type: string }
                  liveStream:
                    $ref: '#/components/schemas/LiveStreamState'
                  timestamp: { type: string, format: date-time }
                required: [ok, service, status, agentIntervalMs, useSimulatedFeed, txlineBaseUrl, liveStream, timestamp]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/matches:
    get:
      summary: Current live/scheduled matches
      description: All matches currently tracked by the agent (scheduled, live, or recently finished in the current polling cycle).
      responses:
        '200':
          description: List of matches.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Match'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/recent-results:
    get:
      summary: Recently finished matches
      description: >
        Finished matches, backfilled via TxLINE's historical scores endpoint
        if not already present in the live store.
      responses:
        '200':
          description: List of finished matches.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Match'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/signals:
    get:
      summary: Live-detected agent signals
      description: All signals generated by the autonomous agent loop from real (or simulated) TxLINE odds movement, most recent first.
      responses:
        '200':
          description: List of signals.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/AgentSignal'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/stats:
    get:
      summary: Aggregate agent statistics
      description: Signal counts, accuracy, and the most recent agent run.
      responses:
        '200':
          description: Aggregate stats.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/Stats'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/pnl:
    get:
      summary: Simulated trading P&L
      description: >
        Simulates a flat 1-unit stake on every settled signal at the odds
        available when it fired, settled against the real match outcome.
        Analytics only, not a trading recommendation.
      responses:
        '200':
          description: P&L summary.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/PnlSummary'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/agent-runs:
    get:
      summary: Autonomous agent run history
      description: History of autonomous agent cycles (most recent first).
      responses:
        '200':
          description: List of agent runs.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/AgentRun'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/odds-history:
    get:
      summary: Odds snapshot history
      description: Up to the 100 most recent odds snapshots, newest first, optionally filtered to a single match.
      parameters:
        - name: matchId
          in: query
          required: false
          schema:
            type: string
          description: Filter to a single match/market id. Omit for all matches combined.
      responses:
        '200':
          description: List of odds snapshots.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/OddsSnapshot'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/onchain/validate-stat:
    get:
      summary: Real on-chain Merkle proof validation (Solana mainnet)
      description: >
        Calls TxLINE's actual Txoracle Anchor program on Solana mainnet to
        cryptographically verify a specific match statistic is provably
        anchored on-chain. The predicate proven is always "the exact value
        TxLINE reports for this stat is what's anchored on-chain" — an
        arbitrary caller-supplied threshold is deliberately not used (see
        docs/superpowers/specs/2026-07-07-rate-limiting-design.md and the
        onchainValidation.ts source for why). Returns `available: false`
        with a `reason` if the server has no Solana wallet configured, or if
        TxLINE has no provable stat for the given fixtureId/seq/statKey
        combination — this is expected, safe behavior, not an error.
      parameters:
        - name: fixtureId
          in: query
          required: true
          schema:
            type: number
          description: TxLINE fixture id (also usable as a Match/OddsSnapshot id).
        - name: seq
          in: query
          required: true
          schema:
            type: number
          description: TXODDS Scores update sequence number (see AgentSignal.evidence.scoresContext.sequence).
        - name: statKey
          in: query
          required: true
          schema:
            type: number
          description: >
            TxLINE-defined numeric stat key. Not publicly documented by
            TxLINE; 1002 is confirmed to generalize across fixtures during
            manual verification.
      responses:
        '200':
          description: Validation attempted (may still report available:false — see description).
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/OnChainValidationResult'
                required: [data]
        '400':
          description: One or more of fixtureId/seq/statKey was missing.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/replay/backtest:
    get:
      summary: Outcome Audit — council vote, trap classification, proof hash
      description: >
        Replays stored real TxLINE odds snapshots (or, if too few are
        available, a fixed historical demo dataset) through the same signal
        engine, then runs a three-agent council vote, Smart Money Trap
        classification, and a SHA-256 proof hash over the full result set.
      responses:
        '200':
          description: Replay/backtest result.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/ReplayBacktest'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/live/odds-stream:
    get:
      summary: Live odds Server-Sent Events stream
      description: >
        Persistent Server-Sent Events connection. Pushes an `odds-update`
        event (JSON payload) whenever the selected match's odds/signals/stats
        signature actually changes — not on a fixed interval. Optionally
        filtered to a single match via `matchId`.
      parameters:
        - name: matchId
          in: query
          required: false
          schema:
            type: string
          description: Filter to a single match. Omit for the most recent match overall.
      responses:
        '200':
          description: text/event-stream connection. Each event is named `odds-update` with a JSON data payload.
          content:
            text/event-stream:
              schema:
                $ref: '#/components/schemas/OddsStreamEvent'
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/live/replay-stream:
    get:
      summary: Demo replay Server-Sent Events stream
      description: >
        Same event shape as /api/live/odds-stream, but replays stored
        snapshots for the given match one tick per second in a repeating
        loop, for judge demos when no live match is active. Adds
        `streamMode: "replay_test"`, `replayCursor`, `replayTotal`, and
        `replayComplete` fields to each event.
      parameters:
        - name: matchId
          in: query
          required: false
          schema:
            type: string
          description: Match/market id to replay. Omit for all stored snapshots combined.
      responses:
        '200':
          description: text/event-stream connection. Each event is named `odds-update` with a JSON data payload.
          content:
            text/event-stream:
              schema:
                $ref: '#/components/schemas/OddsStreamEvent'
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/agent/run-once:
    post:
      summary: Manually trigger one agent cycle
      description: >
        Forces a single out-of-cycle autonomous agent run (fetches TxLINE
        data, generates signals, sends Discord alerts for HIGH severity
        signals). Manual/debug trigger only — never called by the live
        dashboard. Requires the X-API-Key header. Rate-limited to 10
        requests/minute per IP (stricter than the general 1200/min limit),
        as defense-in-depth alongside the API key.
      security:
        - apiKeyAuth: []
      responses:
        '200':
          description: Agent cycle completed.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/AgentRun'
                required: [data]
        '401':
          description: Missing/incorrect X-API-Key header, or the server has no API_ACCESS_KEY configured (fail-closed).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Too many requests — strict 10/min limit for this endpoint specifically exceeded.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error: "Too many requests to this endpoint. Please wait before trying again."
```

- [ ] **Step 2: Validate the spec**

Run: `cd C:\Projects\goalpulse-agent && npx @redocly/cli lint openapi.yaml`
Expected: Exits with no errors (warnings about missing `operationId` or similar low-severity style suggestions are acceptable; only fix if the command reports actual schema errors — e.g. broken `$ref`s or invalid YAML).

- [ ] **Step 3: Commit**

```bash
git add openapi.yaml
git commit -m "Add OpenAPI spec documenting all backend endpoints"
```

---

### Task 2: Serve the spec via an interactive Swagger UI route

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/server.ts:1-13` (imports)
- Modify: `apps/api/src/server.ts` (route registration, right after the `/health` route)

**Interfaces:**
- Consumes: `openapi.yaml` at the repo root (Task 1), loaded via `YAML.load(...)`.

- [ ] **Step 1: Add the dependencies**

In `apps/api/package.json`, the current `dependencies` block (after the rate-limiting feature) is:

```json
  "dependencies": {
    "@coral-xyz/anchor": "^0.32.1",
    "@solana/spl-token": "^0.4.14",
    "@solana/web3.js": "^1.98.4",
    "axios": "^1.18.1",
    "bs58": "^6.0.0",
    "cors": "latest",
    "dotenv": "latest",
    "express": "latest",
    "express-rate-limit": "latest",
    "tweetnacl": "^1.0.3",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/cors": "latest",
    "@types/express": "latest",
    "@types/node": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "^4.1.10"
  }
```

Replace with:

```json
  "dependencies": {
    "@coral-xyz/anchor": "^0.32.1",
    "@solana/spl-token": "^0.4.14",
    "@solana/web3.js": "^1.98.4",
    "axios": "^1.18.1",
    "bs58": "^6.0.0",
    "cors": "latest",
    "dotenv": "latest",
    "express": "latest",
    "express-rate-limit": "latest",
    "swagger-ui-express": "latest",
    "tweetnacl": "^1.0.3",
    "yamljs": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/cors": "latest",
    "@types/express": "latest",
    "@types/node": "latest",
    "@types/swagger-ui-express": "latest",
    "@types/yamljs": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "^4.1.10"
  }
```

- [ ] **Step 2: Install them**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd install`
Expected: completes successfully, `node_modules/swagger-ui-express` and `node_modules/yamljs` now exist, `package-lock.json` updated.

- [ ] **Step 3: Add the imports**

In `apps/api/src/server.ts`, the current imports are:

```ts
import { createHash } from "crypto";
import cors from "cors";
import express from "express";
import { processAgentCycle } from "./agent";
import { fetchRecentTxLineResults } from "./services/txlineClient";
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { validateStatOnChain } from "./services/onchainValidation";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { config } from "./config";
import { requireApiKey } from "./middleware/apiKeyAuth";
import { generalApiLimiter, runOnceLimiter } from "./middleware/rateLimiters";
import { getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
import type { OddsSnapshot } from "./types";
```

Add `path`, `swagger-ui-express`, and `yamljs` imports:

```ts
import { createHash } from "crypto";
import path from "path";
import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { processAgentCycle } from "./agent";
import { fetchRecentTxLineResults } from "./services/txlineClient";
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { validateStatOnChain } from "./services/onchainValidation";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { config } from "./config";
import { requireApiKey } from "./middleware/apiKeyAuth";
import { generalApiLimiter, runOnceLimiter } from "./middleware/rateLimiters";
import { getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
import type { OddsSnapshot } from "./types";
```

- [ ] **Step 4: Add the `/api/docs` route**

Find the existing `/health` route:

```ts
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GoalPulse Agent API",
    status: "running",
    agentIntervalMs: config.agentIntervalMs,
    useSimulatedFeed: config.useSimulatedFeed,
    txlineBaseUrl: config.txlineApiBaseUrl,
    liveStream: getLiveStreamState(),
    timestamp: new Date().toISOString(),
  });
});
```

Add the new route directly after it (note: `path.join(__dirname, "..", "..", "..", "openapi.yaml")` resolves to the repo-root `openapi.yaml` in both `tsx` dev mode, where `__dirname` is `apps/api/src`, and production, where `__dirname` is `apps/api/dist` — `src` and `dist` are sibling directories at the same depth):

```ts
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GoalPulse Agent API",
    status: "running",
    agentIntervalMs: config.agentIntervalMs,
    useSimulatedFeed: config.useSimulatedFeed,
    txlineBaseUrl: config.txlineApiBaseUrl,
    liveStream: getLiveStreamState(),
    timestamp: new Date().toISOString(),
  });
});

const openApiDocument = YAML.load(
  path.join(__dirname, "..", "..", "..", "openapi.yaml")
);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
```

- [ ] **Step 5: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output (clean `tsc` run).

- [ ] **Step 6: Verify existing tests still pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 20 existing tests pass (this task adds no new automated tests, per the spec's decision to use manual + linter verification for static documentation).

- [ ] **Step 7: Manually verify the Swagger UI renders and works**

Start the dev server on an unused port (check `netstat -ano | grep ":4002" | grep LISTENING` first to confirm it's free, same caution as prior features this session):

Run: `cd C:\Projects\goalpulse-agent\apps\api && PORT=4002 npm.cmd run dev`

Open `http://127.0.0.1:4002/api/docs` in a browser (or fetch it) and confirm:
- The page loads and lists all 13 endpoints, grouped and expandable.
- Expanding `GET /api/matches` and clicking "Try it out" → "Execute" returns a real `200` response with actual match data.
- Expanding `POST /api/agent/run-once` shows an "Authorize" control (from the `apiKeyAuth` security scheme) and, when executed without a key, returns `401` with `{"error": "Invalid or missing API key."}` rendered in the UI's response panel — confirming no real agent cycle runs without the key.

Stop the dev server once confirmed (kill by exact PID via `netstat -ano | grep ":4002"` then `powershell -Command "Stop-Process -Id <pid> -Force"` — do not use pattern-based `pkill`, per this session's established lesson about orphaned `tsx watch` processes on Windows).

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/server.ts
git commit -m "Serve OpenAPI spec via interactive Swagger UI at GET /api/docs"
```

---

## Self-Review

**Spec coverage:**
- All 13 endpoints with full schema detail, including the nested `/api/replay/backtest` structure (spec: "File and content") → Task 1.
- `components/schemas` for shared types (`Match`, `AgentSignal`, `OddsSnapshot`, `AgentRun`, plus evidence/scores-context/stats/pnl/replay nested objects) (spec: "File and content") → Task 1.
- `apiKeyAuth` security scheme applied only to `POST /api/agent/run-once` (spec: "Auth and rate limits") → Task 1.
- Rate limits documented in plain text plus `429` responses, general limit referenced from every endpoint via `$ref` (spec: "Auth and rate limits") → Task 1.
- `GET /api/docs` via `swagger-ui-express` + `yamljs`, both with `@types/` packages (spec: "Serving mechanism") → Task 2.
- `/api/docs` stays public, no `requireApiKey` (spec: "Confirmed behavior") → Task 2, Step 4 (route has no `requireApiKey` middleware).
- Linter validation + manual Swagger UI verification including the no-key 401 check (spec: "Testing / verification") → Task 1 Step 2, Task 2 Step 7.
- No behavior change to any existing endpoint (spec: "Goals") → confirmed; Task 2 only adds a new route and two new top-of-file imports, touches no existing route handler.

**Placeholder scan:** No TBD/TODO markers; the full `openapi.yaml` content is written out completely (not summarized), and all `server.ts`/`package.json` snippets are the actual current file contents (verified by reading them) plus the exact new lines.

**Type consistency:** Every `$ref` in `openapi.yaml` (Task 1) points to a schema actually defined in the same file's `components/schemas` section — no dangling references. The `openApiDocument` variable created in Task 2 is used immediately in the same statement block (`swaggerUi.setup(openApiDocument)`), no naming drift.
