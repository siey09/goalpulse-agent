# Proof-Ready Verification Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface already-loaded Solana-eligible signals first so the Verification page opens with a real enabled verification action whenever eligible data exists.

**Architecture:** Add a pure, tested queue builder to the existing verification workspace model. `App.tsx` supplies its existing live signals and replay result to that builder; no data-fetching or validator behavior changes.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library

## Global Constraints

- Do not add API requests, polling, dependencies, persistence, or fabricated proof.
- Rank explicit fixture-plus-sequence signals first, replay-fingerprinted signals second, and all remaining signals last.
- Preserve input order inside each rank, prefer replay items for duplicate IDs, do not mutate inputs, and return at most five objects.
- Do not change stat key `1002`, Solana validation behavior, or its semantic labeling.

---

### Task 1: Build and wire the proof-ready queue

**Files:**
- Modify: `apps/web/src/features/verification/verificationWorkspaceModel.test.ts`
- Modify: `apps/web/src/features/verification/verificationWorkspaceModel.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces: `buildVerificationObjects(liveSignals: AgentSignal[], replayBacktest: ReplayBacktest | null, limit?: number): VerificationObject[]`
- Consumes: existing `AgentSignal`, `ReplayBacktest`, `getOnchainVerifyTarget`, and `VerificationObject` types.

- [ ] **Step 1: Write failing model tests**

Add tests proving that an eligible signal later in the live array ranks first; a replay fingerprint ranks before ordinary non-eligible signals; duplicate IDs prefer replay; source arrays remain unchanged; and output is capped at five.

```ts
const liveNewest = { id: "newest", match: "Newest without sequence" };
const liveEligible = {
  id: "eligible",
  match: "Eligible",
  evidence: { fixtureId: "10", scoresContext: { sequence: 8 } },
};

expect(buildVerificationObjects([liveNewest, liveEligible], null).map(({ signal }) => signal.id))
  .toEqual(["eligible", "newest"]);

const replayBacktest = {
  signals: [{ id: "shared", match: "Replay copy" }],
  proof: { hash: "proof-hash" },
};
const live = [{ id: "shared", match: "Live copy" }, { id: "plain", match: "Plain" }];
const result = buildVerificationObjects(live, replayBacktest);
expect(result.map(({ signal }) => signal.id)).toEqual(["shared", "plain"]);
expect(result[0]).toMatchObject({ source: "TxLINE replay audit", proofHash: "proof-hash" });
expect(live.map(({ id }) => id)).toEqual(["shared", "plain"]);

const many = Array.from({ length: 7 }, (_, index) => ({ id: `s${index}` }));
expect(buildVerificationObjects(many, null)).toHaveLength(5);
```

- [ ] **Step 2: Verify RED**

Run from `apps/web`:

```powershell
npm.cmd test -- src/features/verification/verificationWorkspaceModel.test.ts
```

Expected: FAIL because `buildVerificationObjects` is not exported.

- [ ] **Step 3: Implement the pure queue builder**

Import `ReplayBacktest`, create replay objects before live objects, deduplicate by non-empty signal ID, decorate each item with its original index and priority, sort by priority then index, slice to a non-negative limit, and return the undecorated objects.

```ts
export function buildVerificationObjects(
  liveSignals: AgentSignal[],
  replayBacktest: ReplayBacktest | null,
  limit = 5
): VerificationObject[] {
  const replayItems = (replayBacktest?.signals ?? []).map((signal) => ({
    signal,
    source: "TxLINE replay audit",
    proofHash: replayBacktest?.proof?.hash,
  }));
  const liveItems = liveSignals.map((signal) => ({ signal, source: "Live monitor" }));
  const seenIds = new Set<string>();
  const uniqueItems = [...replayItems, ...liveItems].filter(({ signal }) => {
    if (!signal.id) return true;
    if (seenIds.has(signal.id)) return false;
    seenIds.add(signal.id);
    return true;
  });

  return uniqueItems
    .map((item, index) => ({
      item,
      index,
      priority: getOnchainVerifyTarget(item.signal) ? 0 : item.proofHash ? 1 : 2,
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map(({ item }) => item);
}
```

- [ ] **Step 4: Verify GREEN**

Run the focused model test and expect all cases to pass.

- [ ] **Step 5: Wire App.tsx**

Import `buildVerificationObjects` and replace the inline replay/live slicing memo body with:

```ts
const outcomeVerificationItems = useMemo(
  () => buildVerificationObjects(signals, replayBacktest),
  [signals, replayBacktest]
);
```

- [ ] **Step 6: Run complete verification**

From `apps/web`, run `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build`. Expect 0 failures/errors; the existing Vite main-bundle advisory may remain.

- [ ] **Step 7: Commit, publish, and deploy**

Commit the model, tests, and App wiring as `fix: surface verifiable signals first`. Push the branch, open a ready PR, wait for GitHub and Vercel checks, merge, and verify production queue ordering, enabled button, successful real proof response, overflow, and console health.
