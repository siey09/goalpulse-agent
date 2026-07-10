# Verification Depth Score Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

For a signal, nothing in the app currently distinguishes "this signal's
underlying TxLINE data has been independently proven on-chain" from
"this signal merely claims to be backed by TxLINE data." The second of
the four candidate novel-mechanism ideas recorded 2026-07-10
(`PROJECT_STATE.md`'s "Future ideas — not started") is now being built
to close that gap.

## What "verified" actually means today

`apps/api/src/services/onchainValidation.ts`'s `validateStatOnChain(fixtureId,
seq, statKey)` is a **live Solana `.view()` RPC call** against TxLINE's
Txoracle mainnet program — fired fresh on every invocation, nothing
cached or persisted anywhere (not in `store`, not in the archive, not in
Supabase). `statKey` is hardcoded to `1002` at the one call site
(`App.tsx`'s `runOnchainVerify`) — the module's own docstring explicitly
says it "does not assume or hardcode what a given numeric statKey
semantically means," since TxLINE doesn't publicly document that
mapping. So there is exactly **one** real, checkable on-chain claim per
signal today, not several independent claims — a fractional "N of M
claims verified" score would be fabricated precision, not a genuine
measurement. This is why the status is a multi-state label, not a percentage
(user-confirmed: "genuinely a binary verified/unverified state with
distinct reasons, not a graduated score").

`getOnchainVerifyTarget(signal)` (`App.tsx:974-981`) already draws the
hard eligibility line: a signal needs both `evidence.fixtureId` and
`evidence.scoresContext.sequence` to be checkable at all. Eligibility is
necessary but never sufficient — an eligible signal stays unverified
until an actual RPC call returns `isValid: true`.

## The state model

| State | Condition | Label | Tone |
|---|---|---|---|
| Not verifiable | `getOnchainVerifyTarget(signal)` is `null` | "Not independently verifiable" | neutral/slate |
| Not yet verified | eligible, no check run yet this session | "Not yet verified" | neutral/slate |
| Checking | a check is currently in flight for this signal | "Checking on-chain..." | neutral/slate |
| Verification unavailable | checked, `available: false` (RPC/wallet issue) | "Verification unavailable" + `reason` | warn/orange |
| Verification failed | checked, `available: true`, `isValid: false` | "Verification FAILED" | danger/red |
| On-chain verified | checked, `available: true`, `isValid: true` | "On-chain verified" | success/emerald |

("Checking" avoids the badge showing a stale "Not yet verified" label at
the same moment the Verify button already reads "Verifying on Solana…" —
a small but real honesty gap otherwise.)

No signal selected → the badge doesn't render at all (matches the
existing Outcome Audit Layer's own `!getOnchainVerifyTarget(selectedSignal)`
conditional messaging pattern).

## The existing state bug this surfaces (fixed as part of this work)

There is exactly one "Verify on Solana" UI in the app: the always-visible
"Outcome Audit Layer" card (`App.tsx` ~line 3254, gated on `replayBacktest`
being loaded), which operates on whichever `selectedSignal` is currently
selected — this is the "existing proof hash / evidence chain UI" this
feature surfaces alongside, per the design decision below. Its result
state, `onchainVerify`, is currently a **single shared value**, not keyed
per signal — switching `selectedSignal` to a different signal and back
still shows the previous signal's stale result until Verify is clicked
again. Building a per-signal status badge on top of this as-is would
silently inherit that staleness (e.g. showing "On-chain verified" for a
signal that was never actually checked, just because a *different*
signal was checked earlier in the session).

**Fix (user-confirmed as in-scope, a real bug regardless of this
feature):** key `onchainVerify` by `` `${fixtureId}-${sequence}` `` (the
exact identity of what's being proven — more precise than `signal.id`,
which is optional and can be missing) instead of being one flat value.
The state's inline anonymous object type (currently declared directly in
the `useState<{...}>` call) is extracted into a named `OnChainVerifyData`
type so both the state declaration and the new `getVerificationDepth`
helper (below) can share it without repeating the shape:

```typescript
type OnChainVerifyData = {
  available: boolean;
  reason?: string;
  isValid?: boolean;
  provenStat?: { key: number; value: number; period: number };
  dailyScoresPda?: string;
};

const [onchainVerify, setOnchainVerify] = useState<
  Record<string, { loading: boolean; data: OnChainVerifyData | null }>
>({});
```

`runOnchainVerify` writes to `onchainVerify[key]` only; all reads use
`onchainVerify[key] ?? { loading: false, data: null }` for whatever
signal is currently selected. This is purely a frontend state-shape
change — no backend change, no new dependency.

## Where it surfaces

Inside the existing Outcome Audit Layer card, directly above the
existing "Verify ... on Solana ⛓" button (`App.tsx` ~line 3290-3301) —
not a new panel, not a badge added to every signal-list row (that would
be new pervasive UI beyond "alongside the existing proof hash /
evidence chain UI").

## Computation

Entirely derived client-side from data already present — no new backend
endpoint, no new Solana calls beyond the existing on-demand Verify
button flow:

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

Note: the "Not independently verifiable" state (no `target`) is handled
by the caller returning `null` and the render site falling back to the
already-existing "This signal has no TXODDS sequence data to verify."
messaging — no duplicate copy for the same fact.

## UI

A small badge above the Verify button, tone-colored consistently with
existing conventions elsewhere in the app (emerald=success, red=danger,
orange=warn, slate=neutral — matching the correct/incorrect/pending
badge palette already used in the outcome-verification list, `App.tsx:2849-2856`):

```tsx
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
    <span className={`mb-2 inline-block rounded-full border px-2.5 py-1 text-[10px] font-semibold ${toneClass}`}>
      {depth.label}
    </span>
  );
})()}
```

Placed immediately before the existing Verify button's `<button>` tag.

## Testing

No frontend test runner exists in `apps/web`. Verified via clean
`npm run build` and a manual dev-browser check: select a signal with no
`evidence.fixtureId`/`sequence` (confirm no badge renders, existing
"no TXODDS sequence data" message unchanged), select an eligible signal
that hasn't been checked (confirm "Not yet verified" badge), click
Verify (confirm badge updates to "On-chain verified" or "Verification
FAILED"/"unavailable" depending on the real result), then switch to a
*different* eligible signal and confirm the badge correctly resets to
"Not yet verified" rather than showing the previous signal's stale
result (the exact bug this work fixes). Per the session's process: merge
only after user review, then verify live in production.

## Out of scope (explicitly deferred)

- No fractional/percentage score — see "What 'verified' actually means
  today" above.
- No automatic/background verification of every visible signal — stays
  strictly on-demand via the existing button, per the latency/RPC-rate
  concern raised during brainstorming.
- No badges on signal-list rows — confined to the one existing
  proof/verify surface.
- No backend changes — `/api/onchain/validate-stat` already provides
  everything this feature needs.
- No expansion to check additional `statKey` values — their semantics
  aren't publicly documented by TxLINE, and guessing would be
  fabricating claims, not verifying real ones.
