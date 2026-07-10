# Analyst Chat Topic Expansion — Design Spec

**Date:** 2026-07-10
**Status:** Approved, pending implementation plan.

## Problem

`generateAnalystReply` (`apps/web/src/App.tsx`) is the rule-based
(keyword-matching, zero-cost, no external API) engine behind the "Ask
GoalPulse" chat widget. It currently covers 6 branches — smart money
traps, market reversal radar, score reality checks, the Outcome Audit,
the latest live signal, and a betting-advice refusal — all grounded in
`signals`/`replayBacktest` state already held by the `App` component.

It has zero awareness of nearly everything else built this session:
Agent vs Agent Arena, In-Play Market Maker, the Full Tournament Archive,
Signal Performance, Confidence Calibration, Steam Move Detection, Signal
Correlation, `match_archive`, on-chain verification, or the tech stack.
Any question outside the 6 known topics gets one generic fallback line.
A judge asking about any major feature after a live demo gets nothing
useful.

## Goal

Expand `generateAnalystReply` to answer grounded, factual questions about
every major feature in the app, staying rule-based (keyword/intent
matching, no external AI API, no added cost) and matching the existing
branches' tone and format exactly. Improve the fallback into a topic
index instead of one generic line.

## The core constraint

7 of the 10 new topics have **no data in `App` state at all** — Arena,
Market Maker, the Archive, Signal Performance, Confidence Calibration,
Steam Move Detection, and Signal Correlation each fetch their own data
independently inside their own panel component
(`ArenaPanel.tsx`/`MarketMakerPanel.tsx`/etc.), invisible to `App.tsx`.

**Decision (confirmed):** fetch fresh per question rather than caching on
chat-open or going qualitative-only. `generateAnalystReply` becomes
`async`; each of the 7 new branches calls the existing `request<T>()`
helper (`App.tsx:199`) at ask-time. This guarantees the chat can never
contradict what's currently rendered in the panel below it — correctness
over simplicity, since judges may cross-check answers against the live
dashboard. Costs a small loading state and ~200-500ms latency only on
the 7 new-topic questions; the 6 existing branches stay effectively
instant (they still resolve synchronously, just inside an `async`
function).

## Architecture

### `generateAnalystReply` becomes `async`

```ts
async function generateAnalystReply(question: string): Promise<string> {
  const normalizedQuestion = question.toLowerCase();
  // ...existing sync branches (trap, reversal, score, audit, latest, advice)...
  // ...new branches, most `await`ing a fetch...
  return "..."; // expanded fallback
}
```

Wrapped in a single top-level `try/catch`: any thrown error (network
failure, non-ok response from `request<T>`) returns
`"I couldn't reach that data right now — try again in a moment."`
instead of propagating and breaking the send flow.

### `sendAnalystMessage` becomes `async`

Current (`App.tsx:629-640`):

```ts
function sendAnalystMessage() {
  const trimmedQuestion = analystQuestion.trim();
  if (!trimmedQuestion) return;
  const reply = generateAnalystReply(trimmedQuestion);
  setAnalystMessages((currentMessages) => [
    ...currentMessages,
    { role: "user", content: trimmedQuestion },
    { role: "assistant", content: reply },
  ]);
  setAnalystQuestion("");
}
```

New:

```ts
async function sendAnalystMessage() {
  const trimmedQuestion = analystQuestion.trim();
  if (!trimmedQuestion) return;

  setAnalystMessages((currentMessages) => [
    ...currentMessages,
    { role: "user", content: trimmedQuestion },
  ]);
  setAnalystQuestion("");
  setIsAnalystReplying(true);

  try {
    const reply = await generateAnalystReply(trimmedQuestion);
    setAnalystMessages((currentMessages) => [
      ...currentMessages,
      { role: "assistant", content: reply },
    ]);
  } finally {
    setIsAnalystReplying(false);
  }
}
```

New state: `const [isAnalystReplying, setIsAnalystReplying] = useState(false);`
(declared alongside the existing `analystMessages`/`analystQuestion`
state, `App.tsx:439-449`).

### UI changes (chat panel JSX, `App.tsx:1421-1450`)

- While `isAnalystReplying`, render one extra transient bubble ("GoalPulse
  is thinking…") after the message list, same visual style as an
  assistant bubble.
- Disable the input and the Enter-to-send handler while
  `isAnalystReplying` (prevents overlapping requests from rapid typing).

## New branches

All sync branches keep today's existing wording verbatim. Below,
"topic" is the trigger check; "data" is the source; "template" is the
returned string, written against the real response shapes (confirmed
against each panel's own type definitions and this project's existing
`request<T>()` + `asArray<T>()` + `formatPercent()`/`formatOdds()`
helpers, `App.tsx:196-238`).

### Ordering fix (existing bug, fixed as part of this change)

The current "latest signal" branch (`App.tsx:614`) triggers on bare
`normalizedQuestion.includes("signal")` — broad enough to also match
"signal performance", "signal archive", and "signal correlation"
questions once those branches exist. Fixed by:
1. Tightening the trigger to `includes("latest signal") || includes("latest")`.
2. Placing all new, more specific branches **before** it in the
   function body, so they're checked first regardless.

### 1. Arena

- **Trigger:** `"arena"`, `"kelly"`, `"contrarian"`, `"momentum follower"`,
  `"which agent"`, `"best strategy"`, `"best agent"`
- **Data:** `GET /api/arena` → `request<{ data?: ArenaResponse }>("/api/arena")`,
  read `.data`. `ArenaResponse = { momentumFollower, contrarian,
  kellyCriterion, proof }`, each scoreboard has `label`, `netUnits`,
  `roiPercent`, `correctCount`, `settledCount`.
- **Template:**
  ```
  Agent vs Agent Arena — three strategies on the same live signal feed.
  {label}: {netUnits}u ({roiPercent}% ROI, {correctCount}/{settledCount}
  correct). [repeated for all 3, period-separated] {leaderLabel}
  currently leads by net units. Settlement is on-chain-verified; no
  funds move.
  ```
  Leader = the scoreboard with the highest `netUnits`.
  If `data` is missing: `"Arena data isn't available right now — try again in a moment."`

### 2. Market Maker

- **Trigger:** `"market maker"`, `"bid"`, `"ask"`, `"spread"`, `"fair odds"`
- **Data:** `GET /api/market-maker` → `request<unknown>("/api/market-maker")`,
  `asArray<MarketMakerQuote>(payload, ["data"])`. Pick the quote whose
  `matchId === selectedMatchId`, falling back to the first quote in the
  list.
- **Template:**
  ```
  Market Maker for {match}: home bid {bidOdds.home}/fair
  {fairOdds.home}/ask {askOdds.home}. Spread is {spreadWidth,
  lowercased} ({spreadPct}%) — {reason}
  ```
  If no quotes at all: `"No Market Maker quote is available yet — quotes need at least one prior odds snapshot for a match."`

### 3. Archive (Signal Archive + brief `match_archive` mention)

- **Trigger:** `"archive"`, `"tournament archive"`, `"permanent record"`
- **Data:** `GET /api/archive?page=1&pageSize=1` → `request<unknown>(...)`,
  read `payload.pagination.totalCount`.
- **Template:**
  ```
  The Signal Archive permanently records every settled signal —
  {totalCount} archived so far, independent of the dashboard's
  in-memory caps. There's also a separate match_archive table
  recording every match's final state, write-only with no dashboard
  panel yet.
  ```

### 4. Signal Performance

- **Trigger:** `"signal performance"`, `"accuracy"`, `"track record"`,
  `"win rate"`
- **Data:** `GET /api/signal-performance` → `asArray<SignalTypePerformance>(payload, ["data"])`.
- **Template:**
  ```
  Signal Performance by type — {signalType}: {accuracyPct}%
  ({correctCount}/{settledCount}). [repeated, period-separated]
  ```
  If empty: `"No signal performance data is settled yet."`

### 5. Confidence Calibration

- **Trigger:** `"confidence calibration"`, `"confidence score"`,
  `"calibrated"`, `"calibration"`
- **Data:** `GET /api/signal-performance/by-confidence` →
  `asArray<ConfidenceBucketPerformance>(payload, ["data"])`.
- **Template:**
  ```
  Confidence Calibration checks whether higher-confidence signals
  settle correct more often. Current buckets — {bucket}: {accuracyPct}%
  ({correctCount}/{settledCount}). [repeated] Small sample sizes so
  far, not yet a statistically confirmed pattern.
  ```
  If empty: `"No confidence-bucketed signals are settled yet."`
  The hedge sentence is deliberate and always included when data exists
  — this project has already flagged small-sample-size concerns for
  this exact metric elsewhere (see "Open questions" in
  `PROJECT_STATE.md`); the chat must not overclaim a proven pattern.

### 6. Steam Move Detection

- **Trigger:** `"steam move"`, `"sustained movement"`, `"scanning"`
- **Data:** `GET /api/steam-moves` → `payload.data` (array) +
  `payload.summary` (`{ matchesScanned, steamMovesDetected }`).
- **Template (no active move):**
  ```
  Steam Move Detection scans every match every 5 seconds for sustained
  same-direction odds movement. Scanning {matchesScanned} match(es) —
  no steam move right now.
  ```
- **Template (active move, first entry):**
  ```
  Steam move detected: {match}, {side} side, {firstOdds} → {lastOdds}
  over {tickCount} ticks ({totalMovePct}% move).
  ```

### 7. Signal Correlation

- **Trigger:** `"correlation"`, `"cluster"`, `"cross-match"`
- **Data:** `GET /api/signal-correlation/patterns` →
  `asArray<PatternCluster>(payload, ["data"])`, **then apply the exact
  same dedup `SignalCorrelationPanel.tsx` uses** so the chat's count can
  never contradict the panel:
  ```ts
  function baseMatchId(matchId: string): string {
    return matchId.split("-totals-")[0];
  }
  const genuine = raw.filter(
    (c) => new Set(c.matchIds.map(baseMatchId)).size >= 2
  );
  ```
- **Template (genuine clusters found):**
  ```
  Signal Correlation found {genuine.length} genuine cluster(s) across
  multiple real matches. Top: {side}/{severity}/{market},
  {signalCount} signals across {distinctRealMatchCount} real matches.
  ```
- **Template (none):**
  ```
  No genuine cross-match signal correlation clusters right now —
  Signal Correlation looks for the same pattern (side/severity/market)
  firing across 2+ distinct real matches.
  ```

### 8. On-chain verification (sync, existing state)

- **Trigger:** `"on-chain"`, `"onchain"`, `"blockchain"`, `"solana"`,
  `"verify"`
- **Data:** existing `onchainVerify` state (`App.tsx:458-467`).
- **Template (a verification was run, `onchainVerify.data?.available`):**
  ```
  On-chain verification: {isValid ? "PROOF VALID" : "PROOF FAILED"}
  [ — proven stat key {provenStat.key}, value {provenStat.value}, if present].
  GoalPulse posts a SHA-256 proof hash to Solana devnet so signal
  evidence is independently checkable.
  ```
- **Template (none run yet):**
  ```
  GoalPulse posts a SHA-256 proof hash of the outcome audit to Solana
  devnet for tamper-evident, independently-verifiable evidence. Run
  "Verify on Solana" from the Outcome Audit section to check a
  specific signal.
  ```

### 9. Tech stack (sync, static)

- **Trigger:** `"tech stack"`, `"architecture"`, `"how is this built"`,
  `"what technology"`, `"built with"`
- **Template (no data needed):**
  ```
  GoalPulse is built on: live TxLINE market data (real-time odds +
  TXODDS Scores field context), a Node/Express + TypeScript backend
  running a 5-second autonomous agent cycle, a React + TypeScript
  frontend, and Solana devnet for tamper-evident on-chain proof
  verification. Backend runs on Render, frontend on Vercel.
  ```

### 10. Expanded fallback

Replaces the current single-line fallback (`App.tsx:626`):

```
I can help with: latest signal, smart money traps, market reversal
radar, score reality checks, the Outcome Audit, Agent Arena (Momentum
Follower/Contrarian/Kelly Criterion), Market Maker spreads, the Signal
Archive, Signal Performance, Confidence Calibration, Steam Move
Detection, Signal Correlation, on-chain verification, or the tech
stack. Ask me about any of these.
```

## Branch ordering (final)

To satisfy the "latest signal" fix, the function body order becomes:
trap → reversal → score → audit → **arena → market maker → archive →
signal performance → confidence calibration → steam move → signal
correlation → on-chain → tech stack** → latest signal (tightened) →
advice/bet refusal → fallback.

## Testing

No existing test suite covers `App.tsx` (this project has no frontend
unit tests — `apps/web` has no `test` script, matching the rest of this
session's frontend changes). Verification is:

- `npm run build` in `apps/web` (typecheck + bundle) clean.
- Local dev server against the real production API (`.env.local` has no
  override, so `API_BASE_URL` defaults to the live backend): open the
  chat, ask one question per new topic plus the "signal performance"
  ordering-fix edge case, confirm each returns a grounded, non-generic
  answer with real numbers where applicable, and confirm existing
  topics (trap/reversal/audit/latest) still work unchanged.
- Live production check after deploy, per the user's own process for
  this task: ask a mix of old- and new-topic questions directly against
  the deployed site, including the "signal performance" edge case.

## Explicitly out of scope

- No caching of fetched topic data across questions — always fetches
  fresh, matching the confirmed design decision.
- No per-agent-specific Arena answers (e.g. "how's Contrarian doing"
  returns all three agents' records, not just Contrarian's) — keeps the
  branch count down; the leader is still called out by name.
- No streaming/typing-effect on the "thinking" indicator — a static
  bubble is sufficient.
- No changes to any panel component — this is additive to `App.tsx`
  only, reusing each panel's already-live endpoint.
