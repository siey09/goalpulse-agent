# Meta-Agent Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ArenaPanel.tsx`'s naive `netUnits`-based "Leading" trophy badge with a fair, sample-size-aware, ROI%-based recommendation, and surface it as a new callout above the scoreboard cards — both driven by the same computation so they can never disagree.

**Architecture:** Single-file change to `apps/web/src/components/ArenaPanel.tsx`. A new pure function `getMetaAgentRecommendation(arena)` replaces the existing `leaderAgentId` IIFE; its `agentId` field feeds the three `ScoreboardCard`s' `isLeader` props (unchanged usage site, new source), and its `message` field renders in a new callout placed before the scoreboard grid.

**Tech Stack:** React/TypeScript. No new dependencies, no backend changes.

## Global Constraints

- No backend changes (per spec) — `GET /api/arena` already returns everything needed.
- The existing trophy badge must be fixed in place, not duplicated with a second, possibly-contradictory indicator.
- `apps/web/tsconfig.app.json` has `noUnusedLocals`/`noUnusedParameters` — all new declarations must be consumed within the same task.
- Verify with `npm run build` (`tsc -b && vite build`) from `apps/web`.

---

### Task 1: `getMetaAgentRecommendation` and the callout

**Files:**
- Modify: `apps/web/src/components/ArenaPanel.tsx`

**Interfaces:**
- Consumes: existing `ArenaAgentId`, `ArenaScoreboard`, `ArenaResponse` types (already in this file, unchanged).
- Produces: `getMetaAgentRecommendation(arena: ArenaResponse | null): { agentId: ArenaAgentId | null; message: string }`, used only within this component.

- [ ] **Step 1: Add the constants, mechanism map, and recommendation function**

In `apps/web/src/components/ArenaPanel.tsx`, add this immediately after the existing `formatUnits` function (currently lines 49-51):

```typescript
const MIN_SETTLED_FOR_RANKING = 5;
const NARROW_MARGIN_THRESHOLD_PCT = 10;

const STRATEGY_MECHANISM: Record<ArenaAgentId, string> = {
  momentum_follower: "takes every signal at face value",
  contrarian: "fades signals that fire without real field support",
  kelly_criterion: "sizes stakes by the model's own confidence score instead of betting flat",
};

type MetaAgentRecommendation = {
  agentId: ArenaAgentId | null;
  message: string;
};

function formatRoi(value: number) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function getMetaAgentRecommendation(arena: ArenaResponse | null): MetaAgentRecommendation {
  if (!arena) {
    return { agentId: null, message: "Waiting for arena data." };
  }

  const scoreboards = [arena.momentumFollower, arena.contrarian, arena.kellyCriterion];
  const qualifying = scoreboards.filter((s) => s.settledCount >= MIN_SETTLED_FOR_RANKING);

  if (qualifying.length < 2) {
    return {
      agentId: null,
      message: "Not enough settled positions yet to recommend a leading strategy.",
    };
  }

  const sorted = [...qualifying].sort((a, b) => b.roiPercent - a.roiPercent);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const margin = leader.roiPercent - runnerUp.roiPercent;
  const isNarrow = margin < NARROW_MARGIN_THRESHOLD_PCT;

  const marginText = isNarrow
    ? `a narrow lead over ${runnerUp.label} (${formatRoi(runnerUp.roiPercent)}) — worth revisiting as more signals settle`
    : `a clear lead over ${runnerUp.label} (${formatRoi(runnerUp.roiPercent)})`;

  return {
    agentId: leader.agentId,
    message: `${leader.label} currently leads on ROI at ${formatRoi(leader.roiPercent)} over ${leader.settledCount} settled positions — ${marginText}. It ${STRATEGY_MECHANISM[leader.agentId]}.`,
  };
}
```

- [ ] **Step 2: Replace `leaderAgentId` with the new recommendation**

Find the existing IIFE (currently lines 205-211):

```typescript
  const leaderAgentId = ((): ArenaAgentId | null => {
    if (!arena) return null;
    const scoreboards = [arena.momentumFollower, arena.contrarian, arena.kellyCriterion];
    const maxNetUnits = Math.max(...scoreboards.map((s) => s.netUnits));
    const leaders = scoreboards.filter((s) => s.netUnits === maxNetUnits);
    return leaders.length === 1 ? leaders[0].agentId : null;
  })();
```

Replace with:

```typescript
  const recommendation = getMetaAgentRecommendation(arena);
```

- [ ] **Step 3: Update the three `ScoreboardCard`s' `isLeader` props and add the callout**

Find the current scoreboard grid (currently lines 245-261):

```tsx
          <div className="grid gap-4 lg:grid-cols-3">
            <ScoreboardCard
              scoreboard={arena.momentumFollower}
              isLeader={leaderAgentId === "momentum_follower"}
              accent="sky"
            />
            <ScoreboardCard
              scoreboard={arena.contrarian}
              isLeader={leaderAgentId === "contrarian"}
              accent="orange"
            />
            <ScoreboardCard
              scoreboard={arena.kellyCriterion}
              isLeader={leaderAgentId === "kelly_criterion"}
              accent="violet"
            />
          </div>
```

Replace with:

```tsx
          <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
              <Trophy className="h-4 w-4" />
              Meta-agent recommendation
            </div>
            <p className="text-sm leading-6 text-stone-200">{recommendation.message}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ScoreboardCard
              scoreboard={arena.momentumFollower}
              isLeader={recommendation.agentId === "momentum_follower"}
              accent="sky"
            />
            <ScoreboardCard
              scoreboard={arena.contrarian}
              isLeader={recommendation.agentId === "contrarian"}
              accent="orange"
            />
            <ScoreboardCard
              scoreboard={arena.kellyCriterion}
              isLeader={recommendation.agentId === "kelly_criterion"}
              accent="violet"
            />
          </div>
```

(`Trophy` is already imported at the top of this file — no new import needed.)

- [ ] **Step 4: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors. `getMetaAgentRecommendation`, its constants, and `STRATEGY_MECHANISM` are all defined and consumed within this same task.

- [ ] **Step 5: Manual dev check against live production data**

Run `npm run dev` in `apps/web`, open the app, navigate to the Agent vs Agent Arena panel. Confirm:
- The new "Meta-agent recommendation" callout renders above the three scoreboard cards.
- Given live production data at spec-writing time (Momentum Follower and Kelly Criterion both at 17 settled positions, Contrarian at 0), confirm the callout names Kelly Criterion as the leader with the narrow-margin hedge phrasing ("a narrow lead over Momentum Follower... worth revisiting"), and confirm the trophy badge on the Kelly Criterion card (not the other two) agrees.
- If live data has since changed such that fewer than 2 agents have `settledCount >= 5`, confirm the callout instead shows "Not enough settled positions yet to recommend a leading strategy." and no card shows a trophy badge — this is the honest-fallback path and is equally valid to observe.
- No console errors.

Stop the dev server after checking (exact PID, not pattern-kill).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ArenaPanel.tsx
git commit -m "Replace naive netUnits leader badge with fair ROI%-based meta-agent recommendation"
```

---

## Final Verification

- [ ] Run `npm run build` from `apps/web` — clean build.
- [ ] Run `npm run lint` from `apps/web` — no new lint errors.
- [ ] Manual end-to-end check in the dev browser confirming the callout and trophy badge agree, per Task 1 Step 5.
- [ ] Report the full diff to the user for review — do not push until they explicitly say to.
