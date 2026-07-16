# Health Signal Truth Implementation Plan

> **For Chris:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every System Health stage able to recover to Healthy from truthful runtime evidence, without hiding active failures or adding costly polling.

**Architecture:** Repair the three false-positive sources at the API boundary: completion-aware cycle timing, eligibility-aware fixture coverage, and recoverable archive failure state. Preserve the existing `/api/feed-health` endpoint and System Health cockpit, extending its evidence contract only where needed.

**Tech Stack:** TypeScript, Node/Express, React, Vitest, Vite.

---

### Task 1: Make cycle health completion-aware

**Files:**
- Modify: `apps/api/src/logic/feedHealth.test.ts`
- Modify: `apps/api/src/logic/feedHealth.ts`

**Step 1: Write failing tests**

Add cases proving that current idle time is measured from `finishedAt`, and historical idle gaps are measured from `older.finishedAt` to `newer.startedAt`. Include a long-running cycle that remains healthy when it completed recently, plus a genuinely overdue completed cycle.

**Step 2: Run the focused test and confirm failure**

Run: `pnpm --dir apps/api test -- src/logic/feedHealth.test.ts`

**Step 3: Implement the minimum change**

Use `finishedAt` as the current health anchor. For historical runs, count only inter-run idle time; do not count work duration as a missed cycle.

**Step 4: Run the focused test and confirm success**

Run: `pnpm --dir apps/api test -- src/logic/feedHealth.test.ts`

### Task 2: Replace overlapping interval semantics with a completion-aware scheduler

**Files:**
- Create: `apps/api/src/services/agentScheduler.ts`
- Create: `apps/api/src/services/agentScheduler.test.ts`
- Modify: `apps/api/src/server.ts`

**Step 1: Write failing scheduler tests**

Specify a small scheduler with injectable timers. Prove that it schedules the next run only after the current promise settles, never overlaps cycles, and stops cleanly.

**Step 2: Run the focused test and confirm failure**

Run: `pnpm --dir apps/api test -- src/services/agentScheduler.test.ts`

**Step 3: Implement the scheduler**

Export `createAgentScheduler(run, intervalMs, timers)` with `start()` and `stop()`. `start()` schedules one timeout; after it fires, await `run()` and schedule the next timeout only if still active.

**Step 4: Wire the server**

After the startup cycle, call `createAgentScheduler(() => runGuardedAgentCycle("scheduled"), config.agentIntervalMs).start()` instead of `setInterval`.

**Step 5: Run focused tests**

Run: `pnpm --dir apps/api test -- src/services/agentScheduler.test.ts src/logic/feedHealth.test.ts`

### Task 3: Make fixture coverage odds-eligibility aware

**Files:**
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/services/txlineClient.ts`
- Modify: `apps/api/src/services/txlineClient.test.ts`
- Modify: `apps/api/src/services/mockTxLine.ts`
- Modify: `apps/api/src/agent.ts`
- Modify: `apps/api/src/logic/feedHealth.test.ts`
- Modify: `apps/api/src/logic/feedHealth.ts`

**Step 1: Write failing contract and health tests**

Add `eligibleFixtureCount` and `oddsEnrichmentFailures` to the feed result, and optional equivalents to `AgentRun`. Test that raw fixtures with no supported odds are neutral, eligible-but-unprocessed fixtures are drops, enrichment errors are drops, and legacy runs without the new fields remain neutral.

**Step 2: Run focused tests and confirm failure**

Run: `pnpm --dir apps/api test -- src/services/txlineClient.test.ts src/logic/feedHealth.test.ts`

**Step 3: Instrument the feed**

Count a fixture as eligible only when a supported 1X2 or totals line was obtained. Count a caught odds-enrichment request failure separately. Persist both values on successful agent runs; simulated mode reports every generated fixture as eligible with zero enrichment failures.

**Step 4: Update coverage assessment**

Return `lastRunEligibleFixtureCount` and `lastRunOddsEnrichmentFailures`. Evaluate processed versus eligible counts, not processed versus raw discovery. Treat legacy runs as neutral rather than inventing a failure.

**Step 5: Run focused tests and confirm success**

Run: `pnpm --dir apps/api test -- src/services/txlineClient.test.ts src/logic/feedHealth.test.ts`

### Task 4: Let recovered archive writes clear the active failure state

**Files:**
- Modify: `apps/api/src/services/oddsArchiveOutbox.test.ts`
- Modify: `apps/api/src/services/oddsArchiveOutbox.ts`

**Step 1: Tighten the existing retry test**

After one failed write and a successful retry, require `pending: 0`, `failures: 0`, and `lastFailureAt: null`.

**Step 2: Run the focused test and confirm failure**

Run: `pnpm --dir apps/api test -- src/services/oddsArchiveOutbox.test.ts`

**Step 3: Reset active failure evidence on success**

When a non-empty batch succeeds, clear the consecutive failure count and last failure timestamp after removing the batch.

**Step 4: Run the focused test and confirm success**

Run: `pnpm --dir apps/api test -- src/services/oddsArchiveOutbox.test.ts`

### Task 5: Present the corrected fixture evidence in System Health

**Files:**
- Modify: `apps/web/src/features/health/systemHealthModel.ts`
- Modify: `apps/web/src/features/health/systemHealthModel.test.ts`
- Modify: `apps/web/src/features/health/SystemHealthPage.tsx`
- Modify: `apps/web/src/features/health/SystemHealthPage.test.tsx`
- Modify: `apps/web/src/features/health/useSystemObservability.test.tsx`

**Step 1: Write failing UI-model tests**

Require the fixture stage to show `processed/eligible`, while raw discovery and enrichment failures remain visible as explanatory context. Require incident evidence to distinguish eligible coverage loss from raw discovery.

**Step 2: Run focused tests and confirm failure**

Run: `pnpm --dir apps/web test -- src/features/health/systemHealthModel.test.ts src/features/health/SystemHealthPage.test.tsx`

**Step 3: Extend the frontend contract and rendering**

Add the two new fields to `FeedHealth.fixtureCoverage`, update stage values/incidents, and compute the progress bar from processed versus eligible. Keep raw fixture count as context so judges can see the complete evidence chain.

**Step 4: Run focused tests and confirm success**

Run: `pnpm --dir apps/web test -- src/features/health/systemHealthModel.test.ts src/features/health/SystemHealthPage.test.tsx src/features/health/useSystemObservability.test.tsx`

### Task 6: Verify, publish, and validate live recovery

**Files:**
- Verify all changed files

**Step 1: Run full API verification**

Run: `pnpm --dir apps/api test`

Run: `pnpm --dir apps/api build`

**Step 2: Run full web verification**

Run: `pnpm --dir apps/web test`

Run: `pnpm --dir apps/web lint`

Run: `pnpm --dir apps/web build`

**Step 3: Run repository hygiene check**

Run: `git diff --check`

**Step 4: Commit and push the scoped branch**

Commit only the health-truth design, plan, implementation, and tests; push `codex/health-signal-truth`.

**Step 5: Deploy and verify production evidence**

After deployment, inspect `/health`, `/api/metrics`, `/api/feed-health`, and `/api/stats`. Confirm the System Health page shows Healthy only when cycle idle time, eligible coverage, odds freshness, and archive state are genuinely clean.
