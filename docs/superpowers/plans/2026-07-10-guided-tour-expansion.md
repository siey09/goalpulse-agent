# Guided Tour Expansion (20 → 22 Steps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert two new Guided Tour steps (Meta-agent & Skeptic Check; Historical Pattern Match & Verification Depth) and correctly shift every step-indexed structure that depends on them — `guideTargets`, four hardcoded `judgeStep === N` JSX conditionals, and a numeric retry guard — so no step after the insertion points ends up highlighting the wrong element.

**Architecture:** `ArenaPanel.tsx` gets one new wrapper `id` around the already-shipped Meta-agent/Skeptic callouts. `App.tsx`'s `judgeDemoSteps` and `guideTargets` arrays both grow from 20 to 22 entries in lockstep, all four JSX highlight conditionals shift by +1 (only the first insertion affects them), and the replay-backtest pre-fetch retry guard's upper bound shifts by +1. `DEMO_CHECKLIST.md`'s tour step list and step-count references are updated to match.

**Tech Stack:** React/TypeScript. No new dependencies, no backend changes.

## Global Constraints

- This exact bug class (stale step index after insertion) already happened once this session — every step-indexed structure must be updated together, verified by stepping through the **entire** 22-step tour, not just the two new steps.
- `apps/web/tsconfig.app.json` has `noUnusedLocals`/`noUnusedParameters` — not expected to be triggered by this plan (array-literal edits, no new unused declarations), but verify with a build after each code task regardless.
- Verify with `npm run build` (`tsc -b && vite build`) from `apps/web` after each code task.

---

### Task 1: `ArenaPanel.tsx` — wrapper id for the new step's highlight target

**Files:**
- Modify: `apps/web/src/components/ArenaPanel.tsx`

**Interfaces:**
- Produces: `id="guide-meta-skeptic"` DOM element wrapping the existing Meta-agent recommendation and Skeptic Check callouts — consumed by Task 2's `guideTargets[9]` entry.

- [ ] **Step 1: Add the wrapper**

Find the current block (the Meta-agent recommendation callout, the conditional Skeptic Check callout, and the blank line before the scoreboard grid):

```tsx
          <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
              <Trophy className="h-4 w-4" />
              Meta-agent recommendation
            </div>
            <p className="text-sm leading-6 text-stone-200">{recommendation.message}</p>
          </div>

          {skepticMessage && (
            <div className="mb-4 rounded-2xl border border-rose-400/15 bg-rose-400/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
                <ShieldQuestion className="h-4 w-4" />
                Skeptic check
              </div>
              <p className="text-sm leading-6 text-stone-200">{skepticMessage}</p>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
```

Replace with:

```tsx
          <div id="guide-meta-skeptic">
            <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                <Trophy className="h-4 w-4" />
                Meta-agent recommendation
              </div>
              <p className="text-sm leading-6 text-stone-200">{recommendation.message}</p>
            </div>

            {skepticMessage && (
              <div className="mb-4 rounded-2xl border border-rose-400/15 bg-rose-400/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
                  <ShieldQuestion className="h-4 w-4" />
                  Skeptic check
                </div>
                <p className="text-sm leading-6 text-stone-200">{skepticMessage}</p>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
```

- [ ] **Step 2: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors. Pure JSX restructuring, no logic change.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ArenaPanel.tsx
git commit -m "Add guide-meta-skeptic wrapper for the Guided Tour's new Arena step"
```

---

### Task 2: `App.tsx` — insert both new steps and shift every dependent structure

**Files:**
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `id="guide-meta-skeptic"` (Task 1).
- Produces: 22-entry `judgeDemoSteps` and `guideTargets` arrays, correctly shifted JSX conditionals and retry guard — nothing further consumes this outside the tour itself.

- [ ] **Step 1: Replace `judgeDemoSteps` with the full 22-entry version**

Find the current 20-entry array (`App.tsx:526-607`, starting `const judgeDemoSteps = [` and ending with the `];` after "20. Compliance boundary"). Replace the entire array with:

```typescript
  const judgeDemoSteps = [
    {
      title: "1. Autonomous intelligence overview",
      detail: "GoalPulse ingests TxLINE data, normalizes match markets, monitors odds movement, and explains signals without manual analyst work.",
    },
    {
      title: "2. Odds movement timeline",
      detail: "The chart shows how market prices move over time. Signal markers appear only when movement crosses deterministic compression thresholds.",
    },
    {
      title: "3. TxLINE market board",
      detail: "The market board shows normalized home, draw, and away prices plus precise TXODDS status and clock labels.",
    },
    {
      title: "4. Scores intelligence signals",
      detail: "Signals combine odds movement with TXODDS Scores context: goals, shots, VAR, penalties, cards, danger possession, and reliability warnings.",
    },
    {
      title: "5. Final score audit",
      detail: "Signals are checked after final score settlement so judges can see whether each movement was confirmed or rejected.",
    },
    {
      title: "6. Field pressure context",
      detail: "GoalPulse separates field-backed moves from market-only moves using Field Pressure Index and TXODDS play-by-play events.",
    },
    {
      title: "7. In-Play Market Maker",
      detail: "The Market Maker quotes a live bid/ask spread around TxLINE's de-margined fair odds, widening under field pressure or unreliable data and narrowing when conditions are calm.",
    },
    {
      title: "8. Steam move detection",
      detail: "Steam Move Detection scans every match every 5 seconds for sustained same-direction odds movement, flagging genuine momentum building before it becomes an obvious signal.",
    },
    {
      title: "9. Agent vs Agent Arena",
      detail: "Three strategies compete on the same live signal feed: Momentum Follower trusts the signal, Contrarian fades signals without real field support, and Kelly Criterion sizes its stake by confidence — settlement is on-chain-verified.",
    },
    {
      title: "10. Meta-agent & Skeptic Check",
      detail: "The Arena doesn't just race three strategies — it audits its own leaderboard. A Meta-agent recommendation ranks strategies fairly by ROI, not raw units, and only names a leader once there's enough settled data. A Skeptic Check then questions that lead directly: if it's concentrated in one real match, it says so plainly instead of implying more confidence than the data supports.",
    },
    {
      title: "11. Autonomous agent timeline",
      detail: "The timeline explains the agent loop: ingest feed, capture snapshots, compare odds, attach scores context, score reliability, and store evidence.",
    },
    {
      title: "12. Real TxLINE replay",
      detail: "Replay mode runs stored TxLINE snapshots through the same engine, making the demo repeatable even when live matches are quiet.",
    },
    {
      title: "13. Evidence chain",
      detail: "The evidence chain links odds endpoints, scores endpoints, message IDs, bookmakers, scoreline context, and proof labels for judge-verifiable review.",
    },
    {
      title: "14. Signal review council",
      detail: "Multiple agent checks review movement strength, field context, reliability, reversion risk, and evidence quality before surfacing a signal.",
    },
    {
      title: "15. Proof hash",
      detail: "The replay generates a SHA-256 proof hash so the audit trail can become tamper-evident and independently reviewable.",
    },
    {
      title: "16. Signal detail: precedent & verification",
      detail: "Click \"View details\" on any signal card to open its full evidence trail yourself. Scroll down and you'll find two more things: \"Similar past signals\" searches the permanent archive for precedent of the same signal type and shows honestly how those resolved, and a Verification Depth badge shows whether that specific signal's underlying data has actually been checked on Solana mainnet — never a percentage, always a plain, honest status.",
    },
    {
      title: "17. Transparent thresholds",
      detail: "The engine uses explainable thresholds: watch, momentum shift, and sharp move. No black-box betting recommendation is required.",
    },
    {
      title: "18. Full tournament archive",
      detail: "The archive permanently records every settled signal — status, severity, and market — independent of the dashboard's in-memory caps, giving judges the complete, unfiltered track record.",
    },
    {
      title: "19. Signal performance",
      detail: "Signal Performance breaks accuracy down by signal type — sharp move, momentum shift, watch — showing correct-versus-settled counts so judges can see where the model's calls actually hold up.",
    },
    {
      title: "20. Confidence calibration",
      detail: "Confidence Calibration checks whether the model's own confidence score is honest: higher-confidence signals should settle correct more often, and this panel proves whether that pattern actually holds.",
    },
    {
      title: "21. Signal correlation",
      detail: "Signal Correlation finds clusters of the same pattern firing across multiple real matches — side, severity, and market aligned — evidence the model is detecting a real phenomenon, not noise.",
    },
    {
      title: "22. Compliance boundary",
      detail: "GoalPulse is analytics-only: it explains sports market movement and evidence context. It does not place wagers, custody funds, or facilitate betting execution.",
    },
  ];
```

- [ ] **Step 2: Replace `guideTargets` with the full 22-entry version**

Find the current 20-entry array (`App.tsx:1058-1079`, starting `const guideTargets = [` and ending with `];` after the `compliance`/"Analytics only" entry). Replace the entire array with:

```typescript
  const guideTargets = [
    { id: "overview", text: "GoalPulse Agent" },
    { text: "Selected market" },
    { text: "Market board" },
    { id: "agent", text: "Latest signals" },
    { text: "Outcome verification" },
    { text: "Selected match" },
    { text: "Live bid/ask quotes" },
    { text: "Steam move detection" },
    { text: "Momentum Follower vs Contrarian vs Kelly Criterion" },
    { id: "guide-meta-skeptic", text: "Meta-agent recommendation" },
    { text: "Agent timeline" },
    { id: "guide-backtest-card", text: "Outcome audit" },
    { id: "guide-event-correlation", text: "Evidence chain" },
    { id: "guide-oracle-council", text: "Signal review" },
    { id: "guide-proof-readiness", text: "Proof network" },
    { id: "agent", text: "Latest signals" },
    { text: "Signal thresholds" },
    { text: "Full tournament archive" },
    { text: "Signal performance" },
    { text: "Confidence calibration" },
    { text: "Signal correlation" },
    { id: "compliance", text: "Analytics only" },
  ];
```

- [ ] **Step 3: Shift the four hardcoded `judgeStep === N` JSX conditionals**

Four separate locations. Each is a one-number change; find by the element's `id` to avoid ambiguity (all four `judgeStep === N` conditionals look similar out of context).

In the block with `id="guide-backtest-card"`:

```tsx
                isJudgeMode && judgeStep === 10 ? "relative z-[60] scale-[1.01] rounded-2xl ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
```

Replace with:

```tsx
                isJudgeMode && judgeStep === 11 ? "relative z-[60] scale-[1.01] rounded-2xl ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
```

In the block with `id="guide-event-correlation"`:

```tsx
                      isJudgeMode && judgeStep === 11 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
```

Replace with:

```tsx
                      isJudgeMode && judgeStep === 12 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
```

In the block with `id="guide-oracle-council"`:

```tsx
                      isJudgeMode && judgeStep === 12 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
```

Replace with:

```tsx
                      isJudgeMode && judgeStep === 13 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
```

In the block with `id="guide-proof-readiness"`:

```tsx
                    isJudgeMode && judgeStep === 13 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
```

Replace with:

```tsx
                    isJudgeMode && judgeStep === 14 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
```

**Order matters within this step** — apply these four edits in the order listed (`guide-backtest-card` first, `guide-proof-readiness` last). Doing `guide-event-correlation`'s `11→12` before `guide-oracle-council`'s `12→13` risks the second edit accidentally matching text the first edit just produced, since both involve the literal number `12` transiently. Editing by locating each unique surrounding `id` block (as instructed above), not by bare number search-and-replace, avoids this entirely — follow the block-scoped find shown for each, don't do a global `12`→`13` replace.

- [ ] **Step 4: Shift the `nextGuideStep()` retry guard**

Find (`App.tsx`, inside `nextGuideStep()`):

```typescript
    if (nextStep >= 8 && nextStep <= 10 && !replayBacktest) {
      void runReplayBacktest();
      window.setTimeout(() => focusGuideTarget(nextStep), 700);
    }
```

Replace with:

```typescript
    if (nextStep >= 8 && nextStep <= 11 && !replayBacktest) {
      void runReplayBacktest();
      window.setTimeout(() => focusGuideTarget(nextStep), 700);
    }
```

Do not change the `nextStep === 6` or `nextStep === 7` triggers immediately above this block — both are before the insertion point and are unaffected (confirmed during spec research).

- [ ] **Step 5: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Expand Guided Tour to 22 steps: Meta-agent/Skeptic Check and signal-detail precedent/verification"
```

---

### Task 3: `DEMO_CHECKLIST.md` update and full 22-step manual verification

**Files:**
- Modify: `DEMO_CHECKLIST.md`

**Interfaces:**
- Consumes: Task 1 and Task 2's combined result (the running app).

- [ ] **Step 1: Update the Recommended Live Path's step-count reference**

Find:

```markdown
[Click "Guide", click Next through all 20 steps at a brisk pace —
roughly 3-4 seconds per step]
```

Replace with:

```markdown
[Click "Guide", click Next through all 22 steps at a brisk pace —
roughly 3-4 seconds per step]
```

- [ ] **Step 2: Update the Full Checklist's tour step list**

Find:

```markdown
Click "Guide" (bottom-right). Walks through all 20 steps in order:

1. Autonomous intelligence overview
2. Odds movement timeline
3. TxLINE market board
4. Scores intelligence signals
5. Final score audit
6. Field pressure context
7. In-Play Market Maker
8. Steam move detection
9. Agent vs Agent Arena
10. Autonomous agent timeline
11. Real TxLINE replay
12. Evidence chain
13. Signal review council
14. Proof hash
15. Transparent thresholds
16. Full tournament archive
17. Signal performance
18. Confidence calibration
19. Signal correlation
20. Compliance boundary
```

Replace with:

```markdown
Click "Guide" (bottom-right). Walks through all 22 steps in order:

1. Autonomous intelligence overview
2. Odds movement timeline
3. TxLINE market board
4. Scores intelligence signals
5. Final score audit
6. Field pressure context
7. In-Play Market Maker
8. Steam move detection
9. Agent vs Agent Arena
10. Meta-agent & Skeptic Check
11. Autonomous agent timeline
12. Real TxLINE replay
13. Evidence chain
14. Signal review council
15. Proof hash
16. Signal detail: precedent & verification
17. Transparent thresholds
18. Full tournament archive
19. Signal performance
20. Confidence calibration
21. Signal correlation
22. Compliance boundary
```

- [ ] **Step 3: Update the two remaining "20 steps" references**

Find:

```markdown
3. Guided Tour (all 20 steps, fast pass)
```

Replace with:

```markdown
3. Guided Tour (all 22 steps, fast pass)
```

Find:

```markdown
- Guided Tour opens and all 20 steps navigate without console errors
```

Replace with:

```markdown
- Guided Tour opens and all 22 steps navigate without console errors
```

- [ ] **Step 4: Full manual dev-browser walkthrough — all 22 steps**

Run `npm run dev` in `apps/web`, open the app, click "Guide," then click
"Next" through **all 22 steps in order** (not just the two new ones —
this exact bug class only surfaces by checking previously-correct steps
too). For each step, confirm:
- The spotlighted element (ring highlight) matches what the step's
  title/detail describes.
- The tour panel's step counter reads "N/22."

Pay particular attention to:
- **Step 9 → Step 10**: Arena card highlighted, then the new
  Meta-agent/Skeptic wrapper (`guide-meta-skeptic`) highlighted
  precisely — not the whole Arena card again.
- **Steps 11-15** (the four previously-hardcoded elements, now shifted):
  Autonomous agent timeline → Real TxLINE replay
  (`guide-backtest-card`) → Evidence chain
  (`guide-event-correlation`) → Signal review council
  (`guide-oracle-council`) → Proof hash (`guide-proof-readiness`) — each
  must highlight its own correct element, not a neighboring one.
- **Step 16**: "Latest signals" list highlighted (reused target), with
  detail text instructing a manual click — confirm the tour does *not*
  attempt to open any modal itself.
- **Steps 17-22**: Transparent thresholds through Compliance boundary,
  confirming the tail of the tour still lines up correctly.

No console errors at any step. Stop the dev server after checking
(exact PID, not pattern-kill).

- [ ] **Step 5: Commit**

```bash
git add DEMO_CHECKLIST.md
git commit -m "Update DEMO_CHECKLIST.md guided tour step list to 22 steps"
```

---

## Final Verification

- [ ] Run `npm run build` from `apps/web` — clean build.
- [ ] Run `npm run lint` from `apps/web` — no new lint errors.
- [ ] Full 22-step manual walkthrough completed per Task 3 Step 4, with
      every step's highlight confirmed correct, not just the two new
      steps.
- [ ] Report the full diff to the user for review — do not push until
      they explicitly say to.
