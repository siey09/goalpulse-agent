# Skeptic Agent (Read-Only Critique Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only critique below the Meta-agent recommendation callout in `ArenaPanel.tsx` that checks whether the currently-declared leader's settled positions are concentrated in a single real match, using the same `distinctMatchCount`/`largestMatchSharePct` pattern already proven in `signalPerformance.ts`.

**Architecture:** Single-file addition to `apps/web/src/components/ArenaPanel.tsx`. A new pure function `getSkepticCritique(recommendation, arena)` reads the Meta-agent recommendation's declared leader, groups that leader's settled positions by `baseMatchId`, and returns either a concentration warning or a diversification confirmation message. Rendered as a new callout directly below the existing Meta-agent recommendation callout.

**Tech Stack:** React/TypeScript. No new dependencies (uses an already-installed `lucide-react` icon), no backend changes.

## Global Constraints

- No backend changes (per spec) — `matchId` is already on every position in the existing `GET /api/arena` response.
- No 4th Arena agent, no ledger/position-tracking, no touch to settlement code.
- `apps/web/tsconfig.app.json` has `noUnusedLocals`/`noUnusedParameters` — all new declarations must be consumed within the same task.
- Verify with `npm run build` (`tsc -b && vite build`) from `apps/web`.

---

### Task 1: `getSkepticCritique` and the callout

**Files:**
- Modify: `apps/web/src/components/ArenaPanel.tsx`

**Interfaces:**
- Consumes: existing `MetaAgentRecommendation`, `ArenaResponse`, `ArenaAgentId` types and `getMetaAgentRecommendation`'s output (already in this file, unchanged).
- Produces: `getSkepticCritique(recommendation: MetaAgentRecommendation, arena: ArenaResponse | null): string | null`, used only within this component.

- [ ] **Step 1: Add the `ShieldQuestion` import**

Find the current import line (`ArenaPanel.tsx:1`):

```typescript
import { ShieldCheck, Swords, Trophy } from "lucide-react";
```

Replace with:

```typescript
import { ShieldCheck, ShieldQuestion, Swords, Trophy } from "lucide-react";
```

- [ ] **Step 2: Add `baseMatchId` and `getSkepticCritique`**

Immediately after `getMetaAgentRecommendation` (ends at `ArenaPanel.tsx:100` with the closing `}`), add:

```typescript

const CONCENTRATION_WARNING_THRESHOLD_PCT = 50;

function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}

function getSkepticCritique(
  recommendation: MetaAgentRecommendation,
  arena: ArenaResponse | null
): string | null {
  if (!recommendation.agentId || !arena) return null;

  const leaderScoreboard =
    recommendation.agentId === "momentum_follower"
      ? arena.momentumFollower
      : recommendation.agentId === "contrarian"
        ? arena.contrarian
        : arena.kellyCriterion;

  const settled = leaderScoreboard.positions.filter((p) => p.resultStatus !== "pending");
  if (settled.length === 0) return null;

  const matchCounts = new Map<string, number>();
  for (const position of settled) {
    const base = baseMatchId(position.matchId);
    matchCounts.set(base, (matchCounts.get(base) ?? 0) + 1);
  }

  const distinctMatchCount = matchCounts.size;
  const largestMatchCount = Math.max(...matchCounts.values());
  const largestMatchSharePct = Math.round((largestMatchCount / settled.length) * 100);
  const matchWord = distinctMatchCount === 1 ? "match" : "matches";

  if (largestMatchSharePct >= CONCENTRATION_WARNING_THRESHOLD_PCT) {
    return `Skeptic check: ${leaderScoreboard.label}'s lead is concentrated — ${largestMatchSharePct}% of its ${settled.length} settled positions come from a single real match (${distinctMatchCount} distinct ${matchWord} total). Treat the lead as provisional until it settles across more matches.`;
  }

  return `Skeptic check: ${leaderScoreboard.label}'s lead is diversified across ${distinctMatchCount} distinct real matches (largest single match is ${largestMatchSharePct}% of its ${settled.length} settled positions) — not an artifact of one match's outcome.`;
}
```

- [ ] **Step 3: Compute the critique and render the callout**

Find the existing `recommendation` computation and callout (`ArenaPanel.tsx:254` and the surrounding JSX):

```typescript
  const recommendation = getMetaAgentRecommendation(arena);
```

Replace with:

```typescript
  const recommendation = getMetaAgentRecommendation(arena);
  const skepticMessage = getSkepticCritique(recommendation, arena);
```

Find the Meta-agent recommendation callout's closing `</div>` (immediately before the scoreboard grid — the block ending with `<p className="text-sm leading-6 text-stone-200">{recommendation.message}</p>` followed by `</div>` then a blank line then `<div className="grid gap-4 lg:grid-cols-3">`):

```tsx
            <p className="text-sm leading-6 text-stone-200">{recommendation.message}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
```

Replace with:

```tsx
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

- [ ] **Step 4: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors. `getSkepticCritique`, `baseMatchId`, and `CONCENTRATION_WARNING_THRESHOLD_PCT` are all defined and consumed within this same task.

- [ ] **Step 5: Manual dev check against live production data**

Run `npm run dev` in `apps/web`, open the app, navigate to the Agent vs Agent Arena panel. Confirm:
- The new "Skeptic check" callout renders directly below the "Meta-agent recommendation" callout, above the three scoreboard cards.
- Given live production data at spec-writing time (Kelly Criterion leading with 100% of its 17 settled positions from a single real match, fixture `18209181`), confirm the callout reads the concentration-warning phrasing ("...lead is concentrated — 100% of its 17 settled positions come from a single real match (1 distinct match total). Treat the lead as provisional...").
- If live data has since diversified (more matches have settled for the leader), confirm the callout instead shows the honest diversification-confirmation phrasing — this is an equally valid observation.
- If the Meta-agent recommendation currently shows no leader (fewer than 2 qualifying agents), confirm no Skeptic callout renders at all (nothing to critique).
- No console errors.

Stop the dev server after checking (exact PID, not pattern-kill).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ArenaPanel.tsx
git commit -m "Add Skeptic Agent read-only concentration critique to Arena panel"
```

---

## Final Verification

- [ ] Run `npm run build` from `apps/web` — clean build.
- [ ] Run `npm run lint` from `apps/web` — no new lint errors.
- [ ] Manual end-to-end check in the dev browser confirming the critique renders correctly for the current live leader, per Task 1 Step 5.
- [ ] Report the full diff to the user for review — do not push until they explicitly say to.
