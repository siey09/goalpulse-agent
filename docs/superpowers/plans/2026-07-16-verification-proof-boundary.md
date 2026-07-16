# Verification Proof Boundary Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concise, always-visible explanation that unavailable TxLINE sequence data is an upstream proof boundary rather than a GoalPulse verification failure.

**Architecture:** Keep the change inside the existing `VerificationPage` Trust model section. Add one semantic `role="note"` surface with static, judge-safe copy; preserve all verification data flow and interactions unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Vitest, Testing Library

## Global Constraints

- Use this exact copy: "On-chain verification requires an exact TxLINE event sequence from the upstream feed. When that sequence is unavailable, GoalPulse preserves the signal but does not invent or infer a proof."
- Do not change verification statuses, eligibility rules, Solana checks, or disabled-button behavior.
- Do not add an endpoint, polling loop, dependency, storage, telemetry, modal, toast, animation, or interaction.
- Keep the explanation readable on narrow screens and preserve existing Trust model disclosure keyboard behavior.

---

### Task 1: Add the proof-boundary note

**Files:**
- Modify: `apps/web/src/features/verification/VerificationPage.test.tsx`
- Modify: `apps/web/src/features/verification/VerificationPage.tsx`

**Interfaces:**
- Consumes: the existing `VerificationPage` component and Trust model section.
- Produces: one semantic note containing the exact approved explanation; no new exported API.

- [ ] **Step 1: Write the failing component test**

Add this assertion to the existing dense evidence desk test after the Trust model heading assertion:

```tsx
expect(screen.getByRole("note")).toHaveTextContent(
  "On-chain verification requires an exact TxLINE event sequence from the upstream feed. When that sequence is unavailable, GoalPulse preserves the signal but does not invent or infer a proof."
);
```

- [ ] **Step 2: Run the focused test to verify RED**

Run from `apps/web`:

```powershell
pnpm.cmd test -- src/features/verification/VerificationPage.test.tsx
```

Expected: FAIL because no element with role `note` exists.

- [ ] **Step 3: Implement the minimal note**

In `VerificationPage.tsx`, insert this block between the Trust model heading row and the disclosure grid:

```tsx
<div
  role="note"
  className="mb-3 flex items-start gap-2.5 rounded-lg border border-proof/20 bg-proof/5 px-3 py-2.5"
>
  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-proof-200" aria-hidden="true" />
  <p className="text-xs leading-5 text-stone-300">
    On-chain verification requires an exact TxLINE event sequence from the upstream feed. When that
    sequence is unavailable, GoalPulse preserves the signal but does not invent or infer a proof.
  </p>
</div>
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run from `apps/web`:

```powershell
pnpm.cmd test -- src/features/verification/VerificationPage.test.tsx
```

Expected: the Verification page test file passes.

- [ ] **Step 5: Run complete web verification**

Run from `apps/web`:

```powershell
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd build
```

Expected: all tests pass, ESLint exits 0, TypeScript and Vite build exit 0. The existing Vite bundle-size advisory may remain non-blocking.

- [ ] **Step 6: Commit the implementation**

```powershell
git add apps/web/src/features/verification/VerificationPage.test.tsx apps/web/src/features/verification/VerificationPage.tsx
git commit -m "feat: explain verification proof boundary"
```

- [ ] **Step 7: Publish and inspect production**

Push `codex/verification-proof-boundary`, open a ready pull request, wait for CI and Vercel, merge it, and confirm on the production Verification page that the note is readable, the document has no horizontal overflow, and the console has no errors.
