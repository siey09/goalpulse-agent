# Verification Depth Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a plain-label on-chain verification status badge (not a percentage) next to the existing "Verify on Solana" button, and fix the underlying bug where verification results are a single shared value instead of per-signal.

**Architecture:** Frontend-only, `apps/web/src/App.tsx`. `onchainVerify` state changes from one flat `{loading, data}` value to `Record<string, {loading, data}>` keyed by `` `${fixtureId}-${sequence}` ``. The existing Outcome Audit Layer's button/message/result JSX is wrapped in a small render-scoped computation of `target`/`verifyKey`/`verifyEntry` so it reads the correct per-signal entry. A new `getVerificationDepth()` derives the status label/tone from the same eligibility check plus whatever entry (if any) exists for the currently selected signal.

**Tech Stack:** React/TypeScript. No new dependencies, no backend changes — `GET /api/onchain/validate-stat` already provides everything needed.

## Global Constraints

- No backend changes (per spec) — this is entirely within `apps/web/src/App.tsx`.
- Status is a plain label, never a percentage (per user's explicit correction during brainstorming).
- `apps/web/tsconfig.app.json` has `noUnusedLocals`/`noUnusedParameters` — new declarations must be consumed within the same task.
- Verify with `npm run build` (`tsc -b && vite build`) from `apps/web` after each task.

---

### Task 1: Key `onchainVerify` state per signal (bug fix)

**Files:**
- Modify: `apps/web/src/App.tsx:513-522` (state declaration)
- Modify: `apps/web/src/App.tsx:983-1018` (`runOnchainVerify`)
- Modify: `apps/web/src/App.tsx` render site (`App.tsx:3290-3350`, the Verify button + result block inside the Outcome Audit Layer card)

**Interfaces:**
- Produces: `OnChainVerifyData` type (extracted from the previous inline anonymous type), `onchainVerify: Record<string, { loading: boolean; data: OnChainVerifyData | null }>` — consumed by Task 2's `getVerificationDepth`.

- [ ] **Step 1: Extract `OnChainVerifyData` and re-key the state**

Find the current state declaration (`App.tsx:513-522`):

```typescript
  const [onchainVerify, setOnchainVerify] = useState<{
    loading: boolean;
    data: {
      available: boolean;
      reason?: string;
      isValid?: boolean;
      provenStat?: { key: number; value: number; period: number };
      dailyScoresPda?: string;
    } | null;
  }>({ loading: false, data: null });
```

Replace with:

```typescript
  const [onchainVerify, setOnchainVerify] = useState<
    Record<string, { loading: boolean; data: OnChainVerifyData | null }>
  >({});
```

Add the `OnChainVerifyData` type near the other local type declarations — immediately after the `AgentSignal` type block (right before `type SimilarSignalEntry = {` if present from earlier work, otherwise right after the closing `};` of `AgentSignal`):

```typescript
type OnChainVerifyData = {
  available: boolean;
  reason?: string;
  isValid?: boolean;
  provenStat?: { key: number; value: number; period: number };
  dailyScoresPda?: string;
};
```

- [ ] **Step 2: Update `runOnchainVerify` to write into the keyed map**

Find the current function (`App.tsx:983-1018`):

```typescript
  async function runOnchainVerify(signal: AgentSignal | null) {
    const target = getOnchainVerifyTarget(signal);

    if (!target) return;

    try {
      setOnchainVerify({ loading: true, data: null });

      const payload = await request<{
        data: {
          available: boolean;
          reason?: string;
          isValid?: boolean;
          provenStat?: { key: number; value: number; period: number };
          dailyScoresPda?: string;
        };
      }>(
        `/api/onchain/validate-stat?fixtureId=${encodeURIComponent(
          target.fixtureId
        )}&seq=${target.sequence}&statKey=1002`
      );

      setOnchainVerify({ loading: false, data: payload.data });
    } catch (currentError) {
      setOnchainVerify({
        loading: false,
        data: {
          available: false,
          reason:
            currentError instanceof Error
              ? currentError.message
              : "Unable to reach the on-chain validation endpoint.",
        },
      });
    }
  }
```

Replace with:

```typescript
  async function runOnchainVerify(signal: AgentSignal | null) {
    const target = getOnchainVerifyTarget(signal);

    if (!target) return;

    const key = `${target.fixtureId}-${target.sequence}`;

    try {
      setOnchainVerify((current) => ({ ...current, [key]: { loading: true, data: null } }));

      const payload = await request<{ data: OnChainVerifyData }>(
        `/api/onchain/validate-stat?fixtureId=${encodeURIComponent(
          target.fixtureId
        )}&seq=${target.sequence}&statKey=1002`
      );

      setOnchainVerify((current) => ({
        ...current,
        [key]: { loading: false, data: payload.data },
      }));
    } catch (currentError) {
      setOnchainVerify((current) => ({
        ...current,
        [key]: {
          loading: false,
          data: {
            available: false,
            reason:
              currentError instanceof Error
                ? currentError.message
                : "Unable to reach the on-chain validation endpoint.",
          },
        },
      }));
    }
  }
```

- [ ] **Step 3: Update the render site to read the per-signal entry**

Find the current button + message + result block (`App.tsx:3290-3350`):

```tsx
                    <button
                      type="button"
                      onClick={() => runOnchainVerify(selectedSignal)}
                      disabled={onchainVerify.loading || !getOnchainVerifyTarget(selectedSignal)}
                      className="mt-2 w-full rounded-lg bg-sky-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-50"
                    >
                      {onchainVerify.loading
                        ? "Verifying on Solana…"
                        : getOnchainVerifyTarget(selectedSignal)
                          ? `Verify ${selectedSignal?.match ?? "this signal"} on Solana ⛓`
                          : "Verify on Solana ⛓"}
                    </button>
                    {!getOnchainVerifyTarget(selectedSignal) && (
                      <p className="mt-1.5 text-[10px] leading-4 text-stone-500">
                        {selectedSignal
                          ? "This signal has no TXODDS sequence data to verify."
                          : "Select a signal above to verify it on Solana."}
                      </p>
                    )}

                    {onchainVerify.data && (
                      <div className="mt-2 rounded-lg bg-black/30 p-2 text-[10px]">
                        {onchainVerify.data.available ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-stone-500">On-chain result</span>
                              <span
                                className={`font-semibold ${
                                  onchainVerify.data.isValid
                                    ? "text-emerald-300"
                                    : "text-red-300"
                                }`}
                              >
                                {onchainVerify.data.isValid ? "PROOF VALID" : "PROOF FAILED"}
                              </span>
                            </div>
                            {onchainVerify.data.provenStat && (
                              <p className="mt-1 text-stone-500">
                                Proven stat: key {onchainVerify.data.provenStat.key}, value{" "}
                                {onchainVerify.data.provenStat.value}, period{" "}
                                {onchainVerify.data.provenStat.period}
                              </p>
                            )}
                            {onchainVerify.data.dailyScoresPda && (
                              <a
                                href={`https://explorer.solana.com/address/${onchainVerify.data.dailyScoresPda}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block truncate text-sky-300 underline"
                              >
                                View PDA on Solana Explorer ↗
                              </a>
                            )}
                          </>
                        ) : (
                          <p className="text-stone-500">
                            {onchainVerify.data.reason ?? "On-chain validation unavailable."}
                          </p>
                        )}
                      </div>
                    )}
```

Replace with:

```tsx
                    {(() => {
                      const target = getOnchainVerifyTarget(selectedSignal);
                      const verifyKey = target ? `${target.fixtureId}-${target.sequence}` : null;
                      const verifyEntry = (verifyKey && onchainVerify[verifyKey]) || {
                        loading: false,
                        data: null,
                      };

                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => runOnchainVerify(selectedSignal)}
                            disabled={verifyEntry.loading || !target}
                            className="mt-2 w-full rounded-lg bg-sky-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-50"
                          >
                            {verifyEntry.loading
                              ? "Verifying on Solana…"
                              : target
                                ? `Verify ${selectedSignal?.match ?? "this signal"} on Solana ⛓`
                                : "Verify on Solana ⛓"}
                          </button>
                          {!target && (
                            <p className="mt-1.5 text-[10px] leading-4 text-stone-500">
                              {selectedSignal
                                ? "This signal has no TXODDS sequence data to verify."
                                : "Select a signal above to verify it on Solana."}
                            </p>
                          )}

                          {verifyEntry.data && (
                            <div className="mt-2 rounded-lg bg-black/30 p-2 text-[10px]">
                              {verifyEntry.data.available ? (
                                <>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-stone-500">On-chain result</span>
                                    <span
                                      className={`font-semibold ${
                                        verifyEntry.data.isValid
                                          ? "text-emerald-300"
                                          : "text-red-300"
                                      }`}
                                    >
                                      {verifyEntry.data.isValid ? "PROOF VALID" : "PROOF FAILED"}
                                    </span>
                                  </div>
                                  {verifyEntry.data.provenStat && (
                                    <p className="mt-1 text-stone-500">
                                      Proven stat: key {verifyEntry.data.provenStat.key}, value{" "}
                                      {verifyEntry.data.provenStat.value}, period{" "}
                                      {verifyEntry.data.provenStat.period}
                                    </p>
                                  )}
                                  {verifyEntry.data.dailyScoresPda && (
                                    <a
                                      href={`https://explorer.solana.com/address/${verifyEntry.data.dailyScoresPda}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-1 block truncate text-sky-300 underline"
                                    >
                                      View PDA on Solana Explorer ↗
                                    </a>
                                  )}
                                </>
                              ) : (
                                <p className="text-stone-500">
                                  {verifyEntry.data.reason ?? "On-chain validation unavailable."}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
```

- [ ] **Step 4: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors. This is a behavior-preserving refactor (the app works exactly as before, just correctly per-signal-scoped) — no new UI yet.

- [ ] **Step 5: Manual dev check**

Run `npm run dev`, open the app, select a signal eligible for verification, click "Verify on Solana", confirm the result still displays correctly. Switch to a *different* eligible signal — confirm the button/result area resets to the unchecked state (no stale result from the first signal) — this is the bug this task fixes. Stop the dev server after checking (exact PID, not pattern-kill).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Key onchainVerify state per signal instead of one shared value"
```

---

### Task 2: `getVerificationDepth` and the status badge

**Files:**
- Modify: `apps/web/src/App.tsx` (add `getVerificationDepth` near `getOnchainVerifyTarget`; add the badge inside the IIFE from Task 1, right before the `<button>`)

**Interfaces:**
- Consumes: `OnChainVerifyData`, `onchainVerify` (Task 1), `getOnchainVerifyTarget` (existing).
- Produces: `getVerificationDepth(signal, verifyState): { label: string; tone: "neutral" | "warn" | "danger" | "success" } | null`, used only within this task.

- [ ] **Step 1: Add `getVerificationDepth`**

In `apps/web/src/App.tsx`, immediately after the `getOnchainVerifyTarget` function (`App.tsx:974-981`):

```typescript
  function getOnchainVerifyTarget(signal: AgentSignal | null) {
    const fixtureId = signal?.evidence?.fixtureId;
    const sequence = signal?.evidence?.scoresContext?.sequence;

    if (!fixtureId || !sequence) return null;

    return { fixtureId, sequence };
  }
```

Add:

```typescript
  function getVerificationDepth(
    signal: AgentSignal | null,
    verifyState: Record<string, { loading: boolean; data: OnChainVerifyData | null }>
  ): { label: string; tone: "neutral" | "warn" | "danger" | "success" } | null {
    const target = getOnchainVerifyTarget(signal);
    if (!target) return null;

    const key = `${target.fixtureId}-${target.sequence}`;
    const entry = verifyState[key];

    if (entry?.loading) {
      return { label: "Checking on-chain...", tone: "neutral" };
    }

    if (!entry?.data) {
      return { label: "Not yet verified", tone: "neutral" };
    }

    if (!entry.data.available) {
      return {
        label: `Verification unavailable — ${entry.data.reason ?? "unknown reason"}`,
        tone: "warn",
      };
    }

    if (!entry.data.isValid) {
      return { label: "Verification FAILED", tone: "danger" };
    }

    return { label: "On-chain verified", tone: "success" };
  }
```

- [ ] **Step 2: Render the badge**

Inside the IIFE added in Task 1 (the `return (<>...</>);` block), insert the badge immediately before the `<button` element:

```tsx
                      return (
                        <>
                          {(() => {
                            const depth = getVerificationDepth(selectedSignal, onchainVerify);
                            if (!depth) return null;

                            const toneClass =
                              depth.tone === "success"
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                                : depth.tone === "danger"
                                  ? "border-red-400/30 bg-red-400/10 text-red-200"
                                  : depth.tone === "warn"
                                    ? "border-orange-400/30 bg-orange-400/10 text-orange-200"
                                    : "border-white/10 bg-white/5 text-stone-400";

                            return (
                              <span
                                className={`mb-2 inline-block rounded-full border px-2.5 py-1 text-[10px] font-semibold ${toneClass}`}
                              >
                                {depth.label}
                              </span>
                            );
                          })()}
                          <button
```

(Only the `return (<>` and the badge IIFE are new here — the `<button` line and everything after it inside the fragment is unchanged from Task 1.)

- [ ] **Step 3: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors. `getVerificationDepth` is defined and used within this same task, satisfying `noUnusedLocals`.

- [ ] **Step 4: Manual dev check — all reachable states**

Run `npm run dev`, open the app:
- Select a signal with no `evidence.fixtureId`/`sequence` (e.g. a simulated-feed signal if any exist, or check via browser devtools) — confirm no badge renders and the existing "no TXODDS sequence data" message is unchanged.
- Select an eligible signal that hasn't been checked yet this session — confirm the "Not yet verified" badge (slate).
- Click "Verify on Solana" — confirm the badge briefly reads "Checking on-chain..." then updates to "On-chain verified" (emerald), "Verification FAILED" (red), or "Verification unavailable — ..." (orange) depending on the real result.
- Switch to a different eligible, unchecked signal — confirm the badge resets to "Not yet verified" rather than showing the previous signal's result.

Stop the dev server after checking (exact PID, not pattern-kill).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Add Verification Depth status badge to the Outcome Audit Layer"
```

---

## Final Verification

- [ ] Run `npm run build` from `apps/web` — clean build.
- [ ] Run `npm run lint` from `apps/web` — no new lint errors (the 2 pre-existing `set-state-in-effect` errors at `App.tsx:1266`/`:1275` are unrelated and untouched by this plan).
- [ ] Manual end-to-end check in the dev browser covering all reachable states listed in Task 2 Step 4.
- [ ] Report the full diff to the user for review — do not push until they explicitly say to.
