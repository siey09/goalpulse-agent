# Analyst Chat Topic Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the "Ask GoalPulse" chat widget's rule-based `generateAnalystReply` from 6 topics to 15 (6 existing + 9 new), each new topic grounded in a fresh fetch of real backend data, with an improved fallback listing all topics.

**Architecture:** `generateAnalystReply` becomes `async`, fetching fresh per question via the existing `request<T>()`/`asArray<T>()` helpers already used elsewhere in `App.tsx`. `sendAnalystMessage` awaits it; a new `isAnalystReplying` state drives a "thinking" bubble and disables the input while a fetch is in flight. All work is confined to `apps/web/src/App.tsx` — no panel components change.

**Tech Stack:** React, TypeScript, existing `fetch`-based helpers.

## Global Constraints

- No external AI API, no added cost — every new branch is keyword matching against `question.toLowerCase()`, same as today.
- `apps/web/tsconfig.app.json` has `noUnusedLocals: true` and `noUnusedParameters: true` — every declaration a task adds must be consumed within that same task, or the task's own typecheck step will fail.
- `generateAnalystReply` and `sendAnalystMessage` are atomically coupled by the async conversion — converting one without the other breaks the typecheck (a `Promise<string>` can't be assigned directly to a `content: string` field), so both are done together in Task 1 rather than split.
- Every new branch must be reachable — check for keyword collisions with earlier branches before finalizing trigger lists (two were found and fixed during planning; see Task 1).
- Signal Correlation's genuine-cluster count must use the exact same `baseMatchId` dedup `SignalCorrelationPanel.tsx` uses, so the chat can never contradict what's on screen.
- No changes to any panel component (`ArenaPanel.tsx`, `MarketMakerPanel.tsx`, etc.) — additive to `App.tsx` only.

---

## Task 1: Convert the chat reply flow to async with 9 new topics

**Files:**
- Modify: `apps/web/src/App.tsx:439` (state declarations)
- Modify: `apps/web/src/App.tsx:567-627` (insert new types/helper just above `generateAnalystReply`, replace its full body)
- Modify: `apps/web/src/App.tsx` (the `sendAnalystMessage` function, immediately after `generateAnalystReply`)

**Interfaces:**
- Consumes: `request<T>()` (`App.tsx:199`), `asArray<T>()` (`App.tsx:209`), `formatPercent()`/`formatOdds()`/`formatOddsChange()` (existing helpers), `onchainVerify`/`selectedMatchId`/`signals`/`replayBacktest` (existing `App` state), `getSignalTarget()` (existing helper).
- Produces: `async function generateAnalystReply(question: string): Promise<string>`, `isAnalystReplying: boolean` (both consumed by Task 2's JSX).

**Two collisions found and fixed while drafting this task (not in the original spec — caught during exact-code review):**
1. Market Maker's planned bare `"ask"` trigger would hijack any message containing casual phrases like "can I ask..." — dropped from the trigger list, keeping `"market maker"`, `"bid"`, `"spread"`, `"fair odds"`.
2. `"confidence score"` contains the substring `"score"`, which would hit the existing (earlier-checked) Score Reality Check branch before ever reaching the new Confidence Calibration branch. Fixed by guarding Score Reality Check's `"score"` trigger with `&& !normalizedQuestion.includes("confidence")`. Same pattern applied to Signal Performance's `"accuracy"` trigger (`&& !normalizedQuestion.includes("confidence")`) so "confidence accuracy" phrasing doesn't get stolen either.

- [ ] **Step 1: Add the `isAnalystReplying` state**

Change line 439 from:

```ts
  const [isAnalystChatOpen, setIsAnalystChatOpen] = useState(false);
```

to:

```ts
  const [isAnalystChatOpen, setIsAnalystChatOpen] = useState(false);
  const [isAnalystReplying, setIsAnalystReplying] = useState(false);
```

- [ ] **Step 2: Insert the reply-shape types and `baseMatchId` helper**

Immediately before the `function generateAnalystReply(question: string) {` line (currently line 568), insert:

```ts
  type ArenaScoreboardReply = {
    agentId: string;
    label: string;
    netUnits: number;
    roiPercent: number;
    correctCount: number;
    settledCount: number;
  };

  type ArenaReplyResponse = {
    momentumFollower: ArenaScoreboardReply;
    contrarian: ArenaScoreboardReply;
    kellyCriterion: ArenaScoreboardReply;
  };

  type MarketMakerReplyQuote = {
    matchId: string;
    match: string;
    fairOdds: { home: number; away: number; draw: number };
    bidOdds: { home: number; away: number; draw: number };
    askOdds: { home: number; away: number; draw: number };
    spreadPct: number;
    spreadWidth: "NARROW" | "MODERATE" | "WIDE";
    reason: string;
  };

  type SignalTypePerformanceReply = {
    signalType: string;
    settledCount: number;
    correctCount: number;
    accuracyPct: number;
  };

  type ConfidenceBucketReply = {
    bucket: string;
    settledCount: number;
    correctCount: number;
    accuracyPct: number;
  };

  type SteamMoveReply = {
    match: string;
    side: "home" | "away";
    tickCount: number;
    totalMovePct: number;
    firstOdds: number;
    lastOdds: number;
  };

  type PatternClusterReply = {
    side: string;
    severity: string;
    market: string;
    matchIds: string[];
    signalCount: number;
  };

  function baseMatchId(matchId: string): string {
    return matchId.split("-totals-")[0];
  }

```

- [ ] **Step 3: Replace the `generateAnalystReply` function body**

Replace the entire current `generateAnalystReply` function (from `function generateAnalystReply(question: string) {` through its closing `}`, currently lines 568-627) with:

```ts
  async function generateAnalystReply(question: string): Promise<string> {
    const normalizedQuestion = question.toLowerCase();

    try {
      const replaySignals = replayBacktest?.signals ?? [];
      const trapSignals = replaySignals
        .filter(
          (signal) =>
            signal.trapStatus === "CONFIRMED_TRAP" ||
            signal.trapStatus === "POSSIBLE_TRAP"
        )
        .sort((a, b) => (b.trapScore ?? 0) - (a.trapScore ?? 0));
      const topTrap = trapSignals[0];
      const latestSignal = signals[0];
      const summary = replayBacktest?.summary;

      if (normalizedQuestion.includes("trap") || normalizedQuestion.includes("suspicious")) {
        if (!topTrap) {
          return "I do not see a confirmed trap pattern yet. Run the Outcome Audit first so I can inspect rejected market moves.";
        }

        return `Top suspicious move: ${topTrap.match ?? topTrap.matchId ?? "Unknown match"} · ${getSignalTarget(topTrap)}. Trap score ${topTrap.trapScore ?? 0}. ${topTrap.trapReason ?? "The odds movement was rejected by the final result."}`;
      }

      if (normalizedQuestion.includes("reversal")) {
        if (!topTrap) {
          return "No reversal pattern is available yet. Run the Outcome Audit first.";
        }

        return `Market Reversal Radar shows ${(topTrap.reversalRisk ?? "REVERSAL_SCAN").replaceAll("_", " ")} for ${getSignalTarget(topTrap)}. ${topTrap.reversalReason ?? "The move may have become overextended or failed score confirmation."}`;
      }

      if (
        (normalizedQuestion.includes("score") && !normalizedQuestion.includes("confidence")) ||
        normalizedQuestion.includes("final")
      ) {
        if (!topTrap) {
          return "Score Reality Check needs a finished match. Run the Outcome Audit to compare odds moves against final scores.";
        }

        return `Score Reality Check: ${(topTrap.scoreRealityStatus ?? "WAITING_FOR_FINAL_SCORE").replaceAll("_", " ")}. Final score: ${topTrap.finalScore ?? "pending"}. ${topTrap.scoreRealityReason ?? "GoalPulse compares the odds move against the final result."}`;
      }

      if (normalizedQuestion.includes("audit") || normalizedQuestion.includes("outcome")) {
        if (!summary) {
          return "The Outcome Audit has not been run yet. Click Run audit to replay stored TxLINE odds snapshots and verify what happened.";
        }

        return `Outcome Audit processed ${summary.signalsDetected ?? 0} signal(s), found ${summary.smartMoneyTraps ?? 0} smart money trap pattern(s), with ${summary.confirmedTraps ?? 0} confirmed and ${summary.possibleTraps ?? 0} possible.`;
      }

      if (
        normalizedQuestion.includes("arena") ||
        normalizedQuestion.includes("kelly") ||
        normalizedQuestion.includes("contrarian") ||
        normalizedQuestion.includes("momentum follower") ||
        normalizedQuestion.includes("which agent") ||
        normalizedQuestion.includes("best strategy") ||
        normalizedQuestion.includes("best agent")
      ) {
        const payload = await request<{ data?: ArenaReplyResponse }>("/api/arena");
        const data = payload.data;

        if (!data) {
          return "Arena data isn't available right now — try again in a moment.";
        }

        const boards = [data.momentumFollower, data.contrarian, data.kellyCriterion];
        const leader = boards.reduce((best, board) =>
          board.netUnits > best.netUnits ? board : best
        );
        const boardSummary = boards
          .map(
            (board) =>
              `${board.label}: ${board.netUnits.toFixed(2)}u (${board.roiPercent.toFixed(1)}% ROI, ${board.correctCount}/${board.settledCount} correct)`
          )
          .join(". ");

        return `Agent vs Agent Arena — three strategies on the same live signal feed. ${boardSummary}. ${leader.label} currently leads by net units. Settlement is on-chain-verified; no funds move.`;
      }

      if (
        normalizedQuestion.includes("market maker") ||
        normalizedQuestion.includes("bid") ||
        normalizedQuestion.includes("spread") ||
        normalizedQuestion.includes("fair odds")
      ) {
        const payload = await request<unknown>("/api/market-maker");
        const quotes = asArray<MarketMakerReplyQuote>(payload, ["data"]);
        const quote =
          quotes.find((item) => item.matchId === selectedMatchId) ?? quotes[0];

        if (!quote) {
          return "No Market Maker quote is available yet — quotes need at least one prior odds snapshot for a match.";
        }

        return `Market Maker for ${quote.match}: home bid ${formatOdds(quote.bidOdds.home)}/fair ${formatOdds(quote.fairOdds.home)}/ask ${formatOdds(quote.askOdds.home)}. Spread is ${quote.spreadWidth.toLowerCase()} (${quote.spreadPct.toFixed(1)}%) — ${quote.reason}`;
      }

      if (
        normalizedQuestion.includes("archive") ||
        normalizedQuestion.includes("permanent record")
      ) {
        const payload = await request<{ pagination?: { totalCount?: number } }>(
          "/api/archive?page=1&pageSize=1"
        );
        const totalCount = payload.pagination?.totalCount ?? 0;

        return `The Signal Archive permanently records every settled signal — ${totalCount} archived so far, independent of the dashboard's in-memory caps. There's also a separate match_archive table recording every match's final state, write-only with no dashboard panel yet.`;
      }

      if (
        normalizedQuestion.includes("signal performance") ||
        normalizedQuestion.includes("track record") ||
        normalizedQuestion.includes("win rate") ||
        (normalizedQuestion.includes("accuracy") && !normalizedQuestion.includes("confidence"))
      ) {
        const payload = await request<unknown>("/api/signal-performance");
        const rows = asArray<SignalTypePerformanceReply>(payload, ["data"]);

        if (rows.length === 0) {
          return "No signal performance data is settled yet.";
        }

        const rowSummary = rows
          .map(
            (row) =>
              `${row.signalType}: ${formatPercent(row.accuracyPct)} (${row.correctCount}/${row.settledCount})`
          )
          .join(". ");

        return `Signal Performance by type — ${rowSummary}.`;
      }

      if (
        normalizedQuestion.includes("confidence calibration") ||
        normalizedQuestion.includes("confidence score") ||
        normalizedQuestion.includes("calibrated") ||
        normalizedQuestion.includes("calibration")
      ) {
        const payload = await request<unknown>("/api/signal-performance/by-confidence");
        const rows = asArray<ConfidenceBucketReply>(payload, ["data"]);

        if (rows.length === 0) {
          return "No confidence-bucketed signals are settled yet.";
        }

        const rowSummary = rows
          .map(
            (row) =>
              `${row.bucket}: ${formatPercent(row.accuracyPct)} (${row.correctCount}/${row.settledCount})`
          )
          .join(". ");

        return `Confidence Calibration checks whether higher-confidence signals settle correct more often. Current buckets — ${rowSummary}. Small sample sizes so far, not yet a statistically confirmed pattern.`;
      }

      if (
        normalizedQuestion.includes("steam move") ||
        normalizedQuestion.includes("sustained movement") ||
        normalizedQuestion.includes("scanning")
      ) {
        const payload = await request<{
          data?: SteamMoveReply[];
          summary?: { matchesScanned?: number };
        }>("/api/steam-moves");
        const moves = payload.data ?? [];
        const matchesScanned = payload.summary?.matchesScanned ?? 0;

        if (moves.length === 0) {
          return `Steam Move Detection scans every match every 5 seconds for sustained same-direction odds movement. Scanning ${matchesScanned} match(es) — no steam move right now.`;
        }

        const top = moves[0];

        return `Steam move detected: ${top.match}, ${top.side} side, ${formatOdds(top.firstOdds)} → ${formatOdds(top.lastOdds)} over ${top.tickCount} ticks (${top.totalMovePct.toFixed(1)}% move).`;
      }

      if (
        normalizedQuestion.includes("correlation") ||
        normalizedQuestion.includes("cluster") ||
        normalizedQuestion.includes("cross-match")
      ) {
        const payload = await request<unknown>("/api/signal-correlation/patterns");
        const raw = asArray<PatternClusterReply>(payload, ["data"]);
        const genuine = raw.filter(
          (cluster) => new Set(cluster.matchIds.map(baseMatchId)).size >= 2
        );

        if (genuine.length === 0) {
          return "No genuine cross-match signal correlation clusters right now — Signal Correlation looks for the same pattern (side/severity/market) firing across 2+ distinct real matches.";
        }

        const top = genuine[0];
        const distinctRealMatchCount = new Set(top.matchIds.map(baseMatchId)).size;

        return `Signal Correlation found ${genuine.length} genuine cluster(s) across multiple real matches. Top: ${top.side}/${top.severity}/${top.market}, ${top.signalCount} signals across ${distinctRealMatchCount} real matches.`;
      }

      if (
        normalizedQuestion.includes("on-chain") ||
        normalizedQuestion.includes("onchain") ||
        normalizedQuestion.includes("blockchain") ||
        normalizedQuestion.includes("solana") ||
        normalizedQuestion.includes("verify")
      ) {
        if (onchainVerify.data?.available) {
          const statDetail = onchainVerify.data.provenStat
            ? ` — proven stat key ${onchainVerify.data.provenStat.key}, value ${onchainVerify.data.provenStat.value}`
            : "";

          return `On-chain verification: ${onchainVerify.data.isValid ? "PROOF VALID" : "PROOF FAILED"}${statDetail}. GoalPulse posts a SHA-256 proof hash to Solana devnet so signal evidence is independently checkable.`;
        }

        return `GoalPulse posts a SHA-256 proof hash of the outcome audit to Solana devnet for tamper-evident, independently-verifiable evidence. Run "Verify on Solana" from the Outcome Audit section to check a specific signal.`;
      }

      if (
        normalizedQuestion.includes("tech stack") ||
        normalizedQuestion.includes("architecture") ||
        normalizedQuestion.includes("how is this built") ||
        normalizedQuestion.includes("what technology") ||
        normalizedQuestion.includes("built with")
      ) {
        return "GoalPulse is built on: live TxLINE market data (real-time odds + TXODDS Scores field context), a Node/Express + TypeScript backend running a 5-second autonomous agent cycle, a React + TypeScript frontend, and Solana devnet for tamper-evident on-chain proof verification. Backend runs on Render, frontend on Vercel.";
      }

      if (normalizedQuestion.includes("latest")) {
        if (!latestSignal) {
          return "There is no latest live signal yet. The agent is waiting for a meaningful odds movement threshold.";
        }

        return `Latest live signal: ${latestSignal.match ?? latestSignal.matchId ?? "Unknown match"} · ${getSignalTarget(latestSignal)}. Odds moved from ${formatOdds(latestSignal.oddsBefore)} to ${formatOdds(latestSignal.oddsAfter)}, a ${formatOddsChange(latestSignal.oddsChangePct)} move.`;
      }

      if (normalizedQuestion.includes("advice") || normalizedQuestion.includes("bet")) {
        return "GoalPulse is analytics only. It explains odds movement, trap risk, reversal risk, and score reality checks. It does not recommend bets.";
      }

      return "I can help with: latest signal, smart money traps, market reversal radar, score reality checks, the Outcome Audit, Agent Arena (Momentum Follower/Contrarian/Kelly Criterion), Market Maker spreads, the Signal Archive, Signal Performance, Confidence Calibration, Steam Move Detection, Signal Correlation, on-chain verification, or the tech stack. Ask me about any of these.";
    } catch (error) {
      console.error("Analyst chat reply failed", error);
      return "I couldn't reach that data right now — try again in a moment.";
    }
  }
```

- [ ] **Step 4: Replace `sendAnalystMessage`**

Find and replace:

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

with:

```ts
  async function sendAnalystMessage() {
    const trimmedQuestion = analystQuestion.trim();

    if (!trimmedQuestion || isAnalystReplying) return;

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

(`isAnalystReplying` is added to the early-return guard so rapid Enter presses or double-clicks can't fire overlapping requests.)

- [ ] **Step 5: Typecheck**

Run (from `apps/web`): `npx tsc -b`
Expected: no errors. If `request<T>()`'s generic inference complains about the inline object-literal type parameters (e.g. `request<{ data?: ArenaReplyResponse }>(...)`), verify against `request`'s actual signature at `App.tsx:199` (`async function request<T>(path: string): Promise<T>`) — it's a plain generic return-type cast, so any shape compiles; a real error here means a typo in a field name, not a structural issue.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Expand analyst chat to 15 topics with fresh-fetch async replies"
```

---

## Task 2: Add the "thinking" indicator and disable input while replying

**Files:**
- Modify: `apps/web/src/App.tsx` (chat panel JSX — locate by the `analystMessages.map` block and the input/button below it; exact line numbers have shifted from Task 1)

**Interfaces:**
- Consumes: `isAnalystReplying` (from Task 1).

- [ ] **Step 1: Add the thinking bubble after the message list**

Find:

```tsx
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {analystMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-2xl border p-3 text-xs leading-5 ${
                  message.role === "assistant"
                    ? "border-sky-400/15 bg-sky-400/10 text-sky-50"
                    : "ml-8 border-white/10 bg-white/5 text-stone-200"
                }`}
              >
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-stone-400">
                  {message.role === "assistant" ? "GoalPulse" : "You"}
                </p>
                {message.content}
              </div>
            ))}
          </div>
```

Replace with:

```tsx
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {analystMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-2xl border p-3 text-xs leading-5 ${
                  message.role === "assistant"
                    ? "border-sky-400/15 bg-sky-400/10 text-sky-50"
                    : "ml-8 border-white/10 bg-white/5 text-stone-200"
                }`}
              >
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-stone-400">
                  {message.role === "assistant" ? "GoalPulse" : "You"}
                </p>
                {message.content}
              </div>
            ))}
            {isAnalystReplying && (
              <div className="rounded-2xl border border-sky-400/15 bg-sky-400/10 p-3 text-xs leading-5 text-sky-50">
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-stone-400">
                  GoalPulse
                </p>
                GoalPulse is thinking…
              </div>
            )}
          </div>
```

- [ ] **Step 2: Disable the input and button while replying**

Find:

```tsx
              <input
                value={analystQuestion}
                onChange={(event) => setAnalystQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendAnalystMessage();
                }}
                placeholder="Ask about traps, reversals, score checks..."
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-stone-500 focus:border-sky-400/40"
              />
              <button
                onClick={sendAnalystMessage}
                className="rounded-full border border-sky-400/30 bg-sky-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-sky-400"
              >
                Ask
              </button>
```

Replace with:

```tsx
              <input
                value={analystQuestion}
                onChange={(event) => setAnalystQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendAnalystMessage();
                }}
                placeholder="Ask about traps, reversals, score checks..."
                disabled={isAnalystReplying}
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-stone-500 focus:border-sky-400/40 disabled:opacity-50"
              />
              <button
                onClick={sendAnalystMessage}
                disabled={isAnalystReplying}
                className="rounded-full border border-sky-400/30 bg-sky-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ask
              </button>
```

- [ ] **Step 3: Typecheck and build**

Run (from `apps/web`): `npx tsc -b && npx vite build`
Expected: clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Add thinking indicator and disable chat input while replying"
```

---

## Task 3: Local verification against the real production API

**Files:** none (verification only)

- [ ] **Step 1: Start the local dev server**

Run (from `apps/web`): `npx vite`
(`.env.local` in `apps/web` has no `VITE_API_BASE_URL` override, so `API_BASE_URL` defaults to the live production backend — this exercises the real endpoints, not mocks.)

- [ ] **Step 2: Open the chat and ask one question per topic**

Open `http://localhost:5173`, click "Ask GoalPulse", and ask, one at a time, confirming each returns a grounded, non-generic answer (not the fallback):

- Existing topics (confirm unchanged): "What is the biggest trap?", "any reversal risk?", "what's the final score check?", "run the outcome audit", "what's the latest signal?", "should I bet on this?"
- New topics: "how's the arena doing?", "what's kelly criterion's record?", "market maker spread?", "how many signals in the archive?", "signal performance by type?", "is confidence calibrated?" (the exact edge case that would have collided with Score Reality Check before the Task 1 fix — confirm it returns a Confidence Calibration answer, not a Score Reality Check answer), "any steam moves?", "signal correlation clusters?", "is this verified on-chain?", "what's the tech stack?"
- Edge case: "signal performance" (the exact phrase that would have collided with "latest signal" before the Task 1 fix — confirm it returns a Signal Performance answer, not a "no latest signal" answer)
- Fallback: ask something unrelated like "what's the weather" — confirm the expanded topic-list fallback appears.

- [ ] **Step 3: Confirm the thinking indicator and disabled input**

While a new-topic question is in flight, confirm the "GoalPulse is thinking…" bubble appears briefly and the input is disabled, then re-enables once the reply lands.

- [ ] **Step 4: Stop the dev server**

Confirm the process is stopped cleanly (kill by exact PID, not a pattern match, per this project's Windows dev-server precedent).

- [ ] **Step 5: Report back**

Report the full set of question/answer pairs from Step 2 back before proceeding to push — this is the checkpoint before the user reviews the diff and merges.

---

## Notes for whoever picks this up

- This is a pure frontend change (`apps/web/src/App.tsx` only) — no backend deploy needed, only Vercel's auto-deploy on push to `main`.
- After merge, live production verification (per the user's explicit process) means asking the deployed chat widget a mix of old- and new-topic questions directly, including the two collision edge cases ("signal performance" and "confidence" + "score" together) called out in Task 3.
