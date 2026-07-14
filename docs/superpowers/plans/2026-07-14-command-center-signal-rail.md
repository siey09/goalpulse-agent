# Command Center Signal Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prose-heavy card mosaic with a compact signal rail, live status strip, dominant market workspace, decision rail, and responsive trust bar.

**Architecture:** Keep the existing `CommandCenterPage` data contract and polling behavior. Reshape only its presentational hierarchy, using semantic regions and existing GoalPulse tokens; no backend, dependency, or global-shell changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Recharts, Vitest, Testing Library.

## Global Constraints

- Preserve existing navigation destinations, arena polling, empty states, and guided-tour IDs.
- Use existing palette, typography, radius, border, and spacing tokens only.
- Do not add dependencies or change API contracts.
- Maintain 44px minimum interactive targets and prevent horizontal page overflow at 320px.
- Use test-first red-green-refactor for semantic and behavioral changes.

---

### Task 1: Define the signal-rail semantic contract

**Files:**
- Modify: `apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx`
- Test: `apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx`

**Interfaces:**
- Consumes: existing `CommandCenterPageProps`
- Produces: semantic regions named `Priority signal rail`, `Live status`, `Market workspace`, `Decision activity`, and `Trust evidence`

- [ ] **Step 1: Write the failing semantic test**

Add assertions to the representative-data test:

```tsx
expect(screen.getByRole("region", { name: "Priority signal rail" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Live status" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Market workspace" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Decision activity" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Trust evidence" })).toBeInTheDocument();
expect(screen.getByTestId("command-workbench")).toHaveAttribute("data-layout", "signal-rail");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd run test -- CommandCenterPage.smoke.test.tsx --maxWorkers=1`

Expected: FAIL because the new region names and `data-layout="signal-rail"` are absent.

- [ ] **Step 3: Commit the failing contract**

```powershell
git add apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx
git commit -m "test command center signal rail contract"
```

### Task 2: Implement the compact signal rail and status strip

**Files:**
- Modify: `apps/web/src/features/overview/CommandCenterPage.tsx`
- Test: `apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx`

**Interfaces:**
- Consumes: unchanged `latestSignal`, `kpis`, `systemHealthLabel`, `isSystemHealthy`, and `onNavigate`
- Produces: the semantic contract from Task 1 with existing buttons named `Inspect signal` and `Open verification`

- [ ] **Step 1: Replace the oversized priority card**

Build a full-width rail using this structural outline:

```tsx
<section aria-label="Priority signal rail">
  <Card className="overflow-hidden border-accent/25 bg-surface-3 p-0">
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto]">
      <div>{/* fixture, target, move, evidence */}</div>
      <div>{/* one concise rationale and change */}</div>
      <div>{/* confidence and two 44px actions */}</div>
    </div>
  </Card>
</section>
```

Remove the broad two-column `What changed` / `Why it matters` prose layout. Keep the complete explanation available through `title={latestSignal.explanation}` and the Signals destination.

- [ ] **Step 2: Replace four nested metric cards with one status strip**

```tsx
<section aria-label="Live status">
  <div className="grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-5 md:divide-y-0">
    {/* four live metrics plus system health */}
  </div>
</section>
```

Each metric cell uses alignment and dividers, not a bordered child card.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `npm.cmd run test -- CommandCenterPage.smoke.test.tsx --maxWorkers=1`

Expected: all Command Center smoke tests pass.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/src/features/overview/CommandCenterPage.tsx apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx
git commit -m "build compact command center signal rail"
```

### Task 3: Build the market workspace, decision rail, and trust bar

**Files:**
- Modify: `apps/web/src/features/overview/CommandCenterPage.tsx`
- Test: `apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx`

**Interfaces:**
- Consumes: unchanged `chartData`, `decisionFeed`, arena recommendation and proof data
- Produces: `Market workspace`, `Decision activity`, and `Trust evidence` regions; retains `guide-decision-feed`

- [ ] **Step 1: Make the chart the dominant workspace**

Use a single `lg:grid-cols-12` workspace row. The chart spans eight columns and uses `h-56 sm:h-64 lg:h-[22rem]`; its header integrates fixture and legend without an additional section eyebrow.

- [ ] **Step 2: Turn Decision Feed into a compact activity rail**

Keep the ordered list and real decision data, but use compact rows with a leading state marker, aligned timestamp, one-line title, and restrained detail. Add an `Open archive` action wired to `onNavigate("archive")`.

- [ ] **Step 3: Make trust evidence responsive without horizontal scrolling**

Remove `min-w-[42rem]` and `overflow-x-auto`. Use `grid-cols-1 divide-y` on mobile and `md:grid-cols-3 md:divide-x md:divide-y-0` on larger screens.

- [ ] **Step 4: Extend the navigation test**

```tsx
fireEvent.click(screen.getByRole("button", { name: "Open archive" }));
expect(onNavigate).toHaveBeenNthCalledWith(3, "archive");
```

- [ ] **Step 5: Run the focused test and commit**

Run: `npm.cmd run test -- CommandCenterPage.smoke.test.tsx --maxWorkers=1`

Expected: all focused tests pass.

```powershell
git add apps/web/src/features/overview/CommandCenterPage.tsx apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx
git commit -m "finish command center market workspace"
```

### Task 4: Visual, responsive, and production verification

**Files:**
- Modify if findings require it: `apps/web/src/features/overview/CommandCenterPage.tsx`

**Interfaces:**
- Consumes: completed Command Center surface
- Produces: verified release candidate

- [ ] **Step 1: Run automated checks**

```powershell
npm.cmd run test -- --maxWorkers=1
npm.cmd run lint
npm.cmd run build
node C:\Projects\goalpulse-agent\.agents\skills\impeccable\scripts\detect.mjs --json --scope layout apps/web/src/features/overview/CommandCenterPage.tsx
git diff --check
```

Expected: 0 test failures, lint exit 0, build exit 0, detector `[]`, diff check exit 0.

- [ ] **Step 2: Verify in a real browser**

Run the local Vite app and inspect 1440px, 1024px, 768px, 390px, and 320px widths. Confirm the signal rail is fully visible, the chart is dominant, trust evidence never requires horizontal page scrolling, all actions work, and no error overlay or console error appears.

- [ ] **Step 3: Commit any verified polish**

```powershell
git add apps/web/src/features/overview/CommandCenterPage.tsx
git commit -m "polish command center signal rail"
```
