# Verification Evidence Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sparse Verification Objects page with a dense, truthful evidence workspace using the app's existing signal and Solana validation state.

**Architecture:** Add a pure workspace model for verification readiness and counts, then compose focused queue and proof-rail components inside `VerificationPage`. Extend the shared receipt with an opt-in workspace variant while preserving its compact default, and pass the existing `outcomeVerificationItems` and selection callback from `App.tsx`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, lucide-react, Vitest, Testing Library, Vite.

## Global Constraints

- Add no endpoint, polling loop, dependency, persistence, or fabricated proof claim.
- A local SHA-256 fingerprint must never be described as posted to Solana.
- A replay simulation receipt must never be described as a real trade.
- Use existing GoalPulse color and typography tokens only.
- Queue controls must be native buttons with at least 44px touch targets and visible focus states.
- New copy must use clean UTF-8 or ASCII and contain no mojibake.

---

### Task 1: Verification Workspace Truth Model

**Files:**
- Create: `apps/web/src/features/verification/verificationWorkspaceModel.ts`
- Create: `apps/web/src/features/verification/verificationWorkspaceModel.test.ts`

**Interfaces:**
- Consumes: `AgentSignal`, `OnChainVerifyData`, and `getOnchainVerifyTarget(signal)`.
- Produces: `VerificationObject`, `VerificationObjectStatus`, `getVerificationObjectStatus`, `summarizeVerificationObjects`, and `selectVerificationObject`.

- [ ] **Step 1: Write the failing model tests**

```ts
import { describe, expect, it } from "vitest";
import {
  getVerificationObjectStatus,
  selectVerificationObject,
  summarizeVerificationObjects,
  type VerificationObject,
} from "./verificationWorkspaceModel";

const ready: VerificationObject = {
  signal: { id: "s1", match: "Norway vs England", evidence: { fixtureId: "10", scoresContext: { sequence: 8 } } },
  source: "Live monitor",
};
const noSequence: VerificationObject = {
  signal: { id: "s2", match: "France vs Spain" },
  source: "TxLINE replay audit",
  proofHash: "abc123",
};

describe("verification workspace model", () => {
  it("derives readiness only from explicit evidence", () => {
    expect(getVerificationObjectStatus(ready, {})).toMatchObject({ kind: "ready", label: "Ready to verify" });
    expect(getVerificationObjectStatus(noSequence, {})).toMatchObject({ kind: "no_sequence", label: "No sequence" });
    expect(getVerificationObjectStatus(ready, {
      "10-8": { loading: false, data: { available: true, isValid: true } },
    })).toMatchObject({ kind: "verified", label: "Verified" });
  });

  it("summarizes eligible, fingerprinted, and verified objects", () => {
    expect(summarizeVerificationObjects([ready, noSequence], {
      "10-8": { loading: false, data: { available: true, isValid: true } },
    })).toEqual({ total: 2, eligible: 1, fingerprints: 1, verified: 1 });
  });

  it("uses the selected object or defaults to the first object", () => {
    expect(selectVerificationObject([ready, noSequence], null)).toBe(ready);
    expect(selectVerificationObject([ready, noSequence], noSequence.signal)).toBe(noSequence);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `apps/web/node_modules/.bin/vitest.cmd run src/features/verification/verificationWorkspaceModel.test.ts`

Expected: FAIL because `verificationWorkspaceModel` does not exist.

- [ ] **Step 3: Implement the pure model**

```ts
import { getOnchainVerifyTarget } from "../../lib/verification";
import type { AgentSignal, OnChainVerifyData } from "../../types";

export interface VerificationObject {
  signal: AgentSignal;
  source: string;
  proofHash?: string;
}

export type VerificationObjectStatusKind =
  | "checking" | "ready" | "verified" | "failed" | "unavailable" | "no_sequence";

export interface VerificationObjectStatus {
  kind: VerificationObjectStatusKind;
  label: string;
  reason?: string;
}

export type OnchainVerifyState = Record<string, { loading: boolean; data: OnChainVerifyData | null }>;

export function getVerificationObjectStatus(
  item: VerificationObject,
  state: OnchainVerifyState
): VerificationObjectStatus {
  const target = getOnchainVerifyTarget(item.signal);
  if (!target) return { kind: "no_sequence", label: "No sequence" };
  const entry = state[`${target.fixtureId}-${target.sequence}`];
  if (entry?.loading) return { kind: "checking", label: "Checking" };
  if (!entry?.data) return { kind: "ready", label: "Ready to verify" };
  if (!entry.data.available) return { kind: "unavailable", label: "Unavailable", reason: entry.data.reason };
  if (!entry.data.isValid) return { kind: "failed", label: "Failed" };
  return { kind: "verified", label: "Verified" };
}

export function summarizeVerificationObjects(items: VerificationObject[], state: OnchainVerifyState) {
  return {
    total: items.length,
    eligible: items.filter(({ signal }) => Boolean(getOnchainVerifyTarget(signal))).length,
    fingerprints: items.filter(({ proofHash }) => Boolean(proofHash)).length,
    verified: items.filter((item) => getVerificationObjectStatus(item, state).kind === "verified").length,
  };
}

export function selectVerificationObject(items: VerificationObject[], selected: AgentSignal | null) {
  if (selected) {
    return items.find(({ signal }) => signal === selected || (signal.id && signal.id === selected.id))
      ?? { signal: selected, source: "Selected signal" };
  }
  return items[0] ?? null;
}
```

- [ ] **Step 4: Run the focused test and confirm success**

Run: `apps/web/node_modules/.bin/vitest.cmd run src/features/verification/verificationWorkspaceModel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the model**

```powershell
git add apps/web/src/features/verification/verificationWorkspaceModel.ts apps/web/src/features/verification/verificationWorkspaceModel.test.ts
git commit -m "feat: model verification workspace evidence"
```

### Task 2: Verification Object Queue

**Files:**
- Create: `apps/web/src/features/verification/VerificationObjectQueue.tsx`
- Create: `apps/web/src/features/verification/VerificationObjectQueue.test.tsx`

**Interfaces:**
- Consumes: `VerificationObject[]`, `AgentSignal | null`, `OnchainVerifyState`, `(signal: AgentSignal) => void`.
- Produces: accessible queue buttons with truthful status labels.

- [ ] **Step 1: Write the failing component test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VerificationObjectQueue } from "./VerificationObjectQueue";

it("renders readiness and selects a verification object", () => {
  const onSelect = vi.fn();
  const item = {
    signal: { id: "s1", match: "Norway vs England", target: "England", evidence: { fixtureId: "10", scoresContext: { sequence: 8 } } },
    source: "Live monitor",
  };
  render(<VerificationObjectQueue items={[item]} selectedSignal={null} verifyState={{}} onSelect={onSelect} />);
  expect(screen.getByText("Ready to verify")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Norway vs England/i }));
  expect(onSelect).toHaveBeenCalledWith(item.signal);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `apps/web/node_modules/.bin/vitest.cmd run src/features/verification/VerificationObjectQueue.test.tsx`

Expected: FAIL because the queue component does not exist.

- [ ] **Step 3: Implement the queue**

Create a scroll-free list of native buttons. Each button includes match, target/type, source, formatted time, fingerprint marker when present, and the label from `getVerificationObjectStatus`. Use `aria-pressed` for selection, `min-h-11`, proof-violet selected treatment, and explicit status text.

```tsx
export function VerificationObjectQueue({ items, selectedSignal, verifyState, onSelect }: Props) {
  return (
    <div role="list" aria-label="Verification objects" className="divide-y divide-border">
      {items.map((item, index) => {
        const status = getVerificationObjectStatus(item, verifyState);
        const selected = item.signal === selectedSignal || Boolean(item.signal.id && item.signal.id === selectedSignal?.id);
        return (
          <button
            key={item.signal.id ?? `${item.source}-${index}`}
            type="button"
            role="listitem"
            aria-pressed={selected}
            onClick={() => onSelect(item.signal)}
            className={`min-h-11 w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-proof/70 ${selected ? "bg-proof/10" : "hover:bg-white/[0.03]"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{item.signal.match ?? "Unknown match"}</p>
                <p className="mt-1 text-xs text-stone-400">{getSignalTarget(item.signal)} | {signalTypeLabel(getSignalType(item.signal))}</p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-proof-200">{status.label}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[9px] text-stone-500">
              <span className="truncate">{item.source}</span>
              <span>{item.proofHash ? "Fingerprint linked" : formatTime(item.signal.createdAt)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the focused test and confirm success**

Run: `apps/web/node_modules/.bin/vitest.cmd run src/features/verification/VerificationObjectQueue.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the queue**

```powershell
git add apps/web/src/features/verification/VerificationObjectQueue.tsx apps/web/src/features/verification/VerificationObjectQueue.test.tsx
git commit -m "feat: add verification object queue"
```

### Task 3: Proof Rail and Workspace Receipt

**Files:**
- Create: `apps/web/src/features/verification/VerificationEvidenceChain.tsx`
- Create: `apps/web/src/features/verification/VerificationEvidenceChain.test.tsx`
- Modify: `apps/web/src/components/VerificationReceipt.tsx`
- Create: `apps/web/src/components/VerificationReceipt.test.tsx`

**Interfaces:**
- Consumes: one `VerificationObject`, `OnchainVerifyState`, and existing verification callbacks.
- Produces: four-node proof rail and `VerificationReceipt` prop `variant?: "compact" | "workspace"`.

- [ ] **Step 1: Write failing proof-rail and receipt tests**

```tsx
it("shows every evidence boundary without claiming missing proof", () => {
  render(<VerificationEvidenceChain item={item} verifyState={{}} />);
  expect(screen.getByText("Live monitor")).toBeInTheDocument();
  expect(screen.getByText(/Fixture 10/)).toBeInTheDocument();
  expect(screen.getByText(/Sequence 8/)).toBeInTheDocument();
  expect(screen.getByText("Ready to verify")).toBeInTheDocument();
});

it("renders the workspace receipt without changing the compact default", () => {
  const { rerender } = render(<VerificationReceipt selectedSignal={signal} onchainVerify={{}} onVerify={vi.fn()} />);
  expect(screen.getByTestId("verification-receipt")).toHaveAttribute("data-variant", "compact");
  rerender(<VerificationReceipt variant="workspace" selectedSignal={signal} onchainVerify={{}} onVerify={vi.fn()} />);
  expect(screen.getByTestId("verification-receipt")).toHaveAttribute("data-variant", "workspace");
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `apps/web/node_modules/.bin/vitest.cmd run src/features/verification/VerificationEvidenceChain.test.tsx src/components/VerificationReceipt.test.tsx`

Expected: FAIL because the proof rail and receipt variant are missing.

- [ ] **Step 3: Implement the four-node proof rail**

Render Source record, Signal decision, TXODDS stat target, and Solana validation as a connected ordered list. Each node has a semantic label, exact evidence, and status icon; missing fixture/sequence copy must read `No exact TXODDS sequence is attached to this signal.`.

- [ ] **Step 4: Add the receipt variant and clean corrupted copy**

```ts
export interface VerificationReceiptProps {
  selectedSignal: AgentSignal | null;
  onchainVerify: OnchainVerifyState;
  onVerify: (signal: AgentSignal | null) => void;
  variant?: "compact" | "workspace";
}
```

Default `variant` to `compact`. Workspace mode uses larger padding, a 44px action, and fuller result rows. Replace corrupted strings with `Verifying on Solana...`, `Verify on Solana`, and `View PDA on Solana Explorer` while preserving all validation logic.

- [ ] **Step 5: Run focused tests and confirm success**

Run: `apps/web/node_modules/.bin/vitest.cmd run src/features/verification/VerificationEvidenceChain.test.tsx src/components/VerificationReceipt.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the proof inspector units**

```powershell
git add apps/web/src/features/verification/VerificationEvidenceChain.tsx apps/web/src/features/verification/VerificationEvidenceChain.test.tsx apps/web/src/components/VerificationReceipt.tsx apps/web/src/components/VerificationReceipt.test.tsx
git commit -m "feat: add verification proof rail"
```

### Task 4: Evidence Desk Composition and App Wiring

**Files:**
- Modify: `apps/web/src/features/verification/VerificationPage.tsx`
- Create: `apps/web/src/features/verification/VerificationPage.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `verificationObjects: VerificationObject[]` and `onSelectSignal: (signal: AgentSignal) => void` in addition to existing props.
- Produces: full evidence desk using only existing app state.

- [ ] **Step 1: Write the failing page test**

```tsx
it("renders a dense evidence desk and defaults to the first object", () => {
  render(
    <VerificationPage
      verificationObjects={[readyItem, fingerprintItem]}
      selectedSignal={null}
      onSelectSignal={vi.fn()}
      onchainVerify={{}}
      onVerify={vi.fn()}
    />
  );
  expect(screen.getByRole("heading", { name: "Verification Evidence Desk" })).toBeInTheDocument();
  expect(screen.getByText("2 objects")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Selected proof inspector" })).toHaveTextContent("Norway vs England");
  expect(screen.getByText("Trust model")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused page test and confirm failure**

Run: `apps/web/node_modules/.bin/vitest.cmd run src/features/verification/VerificationPage.test.tsx`

Expected: FAIL because the page does not accept workspace objects or render the desk.

- [ ] **Step 3: Compose the page**

Use `summarizeVerificationObjects` and `selectVerificationObject`. The composition must use these concrete regions and props:

```tsx
<header className="border-b border-border pb-4">
  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-proof-200">Trust workspace</p>
  <h1 className="font-display text-2xl font-bold text-white">Verification Evidence Desk</h1>
  <p className="mt-1 max-w-3xl text-sm text-stone-400">Trace each signal from source evidence to an independent Solana mainnet check.</p>
</header>
<section aria-label="Verification summary" className="grid grid-cols-2 border-y border-border bg-surface-2 sm:grid-cols-4">
  {[
    ["Objects", summary.total],
    ["On-chain eligible", summary.eligible],
    ["Local fingerprints", summary.fingerprints],
    ["Verified this session", summary.verified],
  ].map(([label, value]) => <div key={label} className="border-r border-border p-3"><p className="text-[11px] text-stone-400">{label}</p><p className="font-mono text-lg text-white">{value}</p></div>)}
</section>
<div className="grid gap-4 xl:grid-cols-12 xl:items-start">
  <Card className="overflow-hidden xl:col-span-4">
    <VerificationObjectQueue items={verificationObjects} selectedSignal={activeObject?.signal ?? null} verifyState={onchainVerify} onSelect={onSelectSignal} />
  </Card>
  <Card role="region" aria-label="Selected proof inspector" className="p-4 xl:col-span-8">
    {activeObject ? <><h2 className="text-lg font-semibold text-white">{activeObject.signal.match ?? "Selected signal"}</h2><VerificationEvidenceChain item={activeObject} verifyState={onchainVerify} /><VerificationReceipt variant="workspace" selectedSignal={activeObject.signal} onchainVerify={onchainVerify} onVerify={onVerify} /></> : <EmptyState reason="Verification objects appear after the live monitor or Replay Lab generates a signal." />}
  </Card>
</div>
<section aria-labelledby="trust-model-title">
  <h2 id="trust-model-title" className="text-sm font-semibold text-white">Trust model</h2>
  <div className="mt-2 grid gap-2 md:grid-cols-2">
    {trustDefinitions.map((item) => <details key={item.title} className="rounded-lg border border-border bg-surface-2 p-3"><summary className="cursor-pointer text-xs font-semibold text-stone-200">{item.title}</summary><p className="mt-2 text-xs leading-5 text-stone-400">{item.detail}</p></details>)}
  </div>
</section>
```

When there are no objects and no selected signal, show the specific empty reason: `Verification objects appear after the live monitor or Replay Lab generates a signal.`

- [ ] **Step 4: Wire existing state through App**

```tsx
<VerificationPage
  verificationObjects={outcomeVerificationItems}
  selectedSignal={selectedSignal}
  onSelectSignal={setSelectedSignal}
  onchainVerify={onchainVerify}
  onVerify={runOnchainVerify}
/>
```

- [ ] **Step 5: Run page and affected app tests**

Run: `apps/web/node_modules/.bin/vitest.cmd run src/features/verification/VerificationPage.test.tsx src/App.replay.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the composed workspace**

```powershell
git add apps/web/src/features/verification/VerificationPage.tsx apps/web/src/features/verification/VerificationPage.test.tsx apps/web/src/App.tsx
git commit -m "feat: build verification evidence desk"
```

### Task 5: Full Verification and Production Handoff

**Files:**
- Verify all changed files.

**Interfaces:**
- Consumes: completed evidence desk.
- Produces: a merge-ready, production-verified branch.

- [ ] **Step 1: Run the full web tests**

Run: `apps/web/node_modules/.bin/vitest.cmd run`

Expected: all test files pass.

- [ ] **Step 2: Run lint and TypeScript in parallel**

Run: `apps/web/node_modules/.bin/eslint.cmd .`

Run: `apps/web/node_modules/.bin/tsc.cmd -b`

Expected: both exit 0.

- [ ] **Step 3: Build the production bundle**

Run: `apps/web/node_modules/.bin/vite.cmd build`

Expected: build exits 0; the existing bundle-size advisory may remain non-blocking.

- [ ] **Step 4: Check repository hygiene**

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

- [ ] **Step 5: Push, create a ready PR, and merge after CI passes**

Push `codex/verification-evidence-desk`, create a PR describing the zero-new-usage architecture and validation evidence, wait for backend/frontend/Vercel checks, then merge to `main`.

- [ ] **Step 6: Verify production**

Confirm the Vercel root returns HTTP 200, open Verification from the production navigation, select at least two objects, and confirm compact Replay Lab verification remains intact. Verify no console errors, horizontal overflow, or corrupted glyphs.
