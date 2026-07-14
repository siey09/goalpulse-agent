# Archive Evidence Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Archive as a compact, responsive, resilient evidence ledger.

**Architecture:** Keep the existing Archive API and audit-drawer mapping inside `SignalArchivePanel`, replacing its stacked card controls and record cards with a toolbar plus dual desktop-table/mobile-row presentation. Compose existing performance panels in a responsive supporting grid from `ArchivePage` without changing their data contracts.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Lucide React.

## Global Constraints

- Preserve all current Archive API query parameters and the existing `AgentSignal` mapping.
- Do not add dependencies or fabricate aggregate metrics.
- Minimum interactive height is 44px and all controls require accessible names.
- Fetch failures must clear stale entries and offer an in-place retry.
- Desktop and mobile presentations must expose equivalent evidence.

---

### Task 1: Ledger contract and resilient state tests

**Files:**
- Modify: `apps/web/src/components/SignalArchivePanel.smoke.test.tsx`
- Modify: `apps/web/src/features/archive/ArchivePage.smoke.test.tsx`

**Interfaces:**
- Consumes: `SignalArchivePanelProps.onSelectSignal`
- Produces: regression coverage for ledger semantics, filter reset, failure recovery, and Archive composition

- [ ] **Step 1: Write failing tests**

Add assertions for an accessible `table` named `Permanent signal archive`, labeled search and select controls, visible fixture evidence, a recoverable `Archive unavailable` state with `Retry archive`, a `Clear filters` action, and the supporting-analysis grid contract.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter web test -- SignalArchivePanel.smoke.test.tsx ArchivePage.smoke.test.tsx`

Expected: failures because the existing UI has no semantic ledger, retry action, consolidated controls, or supporting grid.

- [ ] **Step 3: Commit RED tests**

Commit only the test files with message `test archive evidence ledger contract`.

### Task 2: Responsive evidence ledger

**Files:**
- Modify: `apps/web/src/components/SignalArchivePanel.tsx`

**Interfaces:**
- Consumes: `GET /api/archive?page&pageSize&matchId&status&market&event`
- Produces: accessible desktop ledger, equivalent mobile records, retry and filter-reset interactions

- [ ] **Step 1: Implement the toolbar and state model**

Add explicit error state, request nonce for retry, stale-data clearing, consolidated labeled controls, default-filter detection, and visible result range.

- [ ] **Step 2: Implement desktop and mobile evidence views**

Render a semantic table from `md` upward and compact record buttons below `md`. Preserve the existing `archiveEntryToSignal` call on both presentations.

- [ ] **Step 3: Run focused tests to verify GREEN**

Run: `pnpm --filter web test -- SignalArchivePanel.smoke.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 4: Commit**

Commit implementation and tests with message `build archive evidence ledger`.

### Task 3: Page composition and complete verification

**Files:**
- Modify: `apps/web/src/features/archive/ArchivePage.tsx`
- Modify: `apps/web/src/features/archive/ArchivePage.smoke.test.tsx`

**Interfaces:**
- Consumes: existing Archive panels
- Produces: compact page introduction and responsive supporting-analysis layout

- [ ] **Step 1: Implement the page composition**

Add a restrained Archive heading and trust statement, keep the ledger first, place performance and calibration in `xl:grid-cols-2`, and retain verified case studies last.

- [ ] **Step 2: Run focused and full verification**

Run focused Archive tests, then the complete web test suite, lint, and production build. Run Impeccable's detector on the changed TSX files.

- [ ] **Step 3: Verify in the browser**

Inspect 1440px, 1024px, 768px, 390px, and 320px widths; verify filter interaction, retry/empty states where feasible, row-to-drawer navigation, focus visibility, and absence of horizontal overflow.

- [ ] **Step 4: Commit**

Commit final composition and fixes with message `finish archive intelligence workspace`.
