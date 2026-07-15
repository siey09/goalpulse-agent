# Signals Triage Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Signals page into a responsive, accessible signal-triage workspace with a dense queue, useful filters, explicit evidence states, and preserved live analysis modules.

**Architecture:** Keep `SignalsPage` as the page boundary and derive the operator queue from its existing `outcomeVerificationItems` prop. Preserve the existing self-fetching Steam, Correlation, and Intelligence panels as secondary analysis surfaces, but change their page placement so the queue owns the primary hierarchy. Keep the existing `onSelectSignal` contract for the audit drawer.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, Lucide React, Vitest, Testing Library.

## Global Constraints

- Preserve the existing GoalPulse instrument-console tokens; add no dependency.
- Use amber only for primary attention/actions, danger for HIGH severity, positive for field evidence, and proof for audit coverage.
- All interactive targets must be at least 44px high and keyboard accessible.
- Mobile must not require horizontal scrolling at 320px or wider.
- Empty and filtered-empty states must explain the reason and next action without invented data.
- The existing `onSelectSignal(signal: AgentSignal): void` callback remains the only inspection integration.

---

### Task 1: Build the signal triage workspace

**Files:**
- Modify: `apps/web/src/features/signals/SignalsPage.tsx`
- Modify: `apps/web/src/features/signals/SignalsPage.smoke.test.tsx`

**Interfaces:**
- Consumes: `OutcomeVerificationItem[]` and `(signal: AgentSignal) => void` from the existing page props.
- Produces: a semantic `SignalsPage` with `Signal queue`, `Live pattern scan`, and `Signal explainability` regions.

- [ ] **Step 1: Write failing behavior tests**

Add representative HIGH/LOW, field-backed/market-only, pending/settled signals and assert:

```tsx
expect(screen.getByRole("heading", { level: 1, name: "Signal Triage" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Signal queue" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Live pattern scan" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Signal explainability" })).toBeInTheDocument();
fireEvent.click(screen.getAllByRole("button", { name: /Inspect signal/ })[0]);
expect(onSelectSignal).toHaveBeenCalledWith(items[0].signal);
fireEvent.click(screen.getByRole("button", { name: "High priority" }));
expect(screen.getByText("1 signal shown")).toBeInTheDocument();
fireEvent.change(screen.getByRole("searchbox", { name: "Search signals" }), { target: { value: "missing" } });
expect(screen.getByText(/No signals match/)).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Clear filters" })).toHaveClass("min-h-11");
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cd apps/web && node_modules/.bin/vitest.cmd run src/features/signals/SignalsPage.smoke.test.tsx`

Expected: FAIL because `Signal Triage`, the semantic regions, filters, and queue actions do not exist.

- [ ] **Step 3: Implement the queue and page hierarchy**

In `SignalsPage.tsx`:

```tsx
type SignalFilter = "all" | "high" | "field" | "settled";

const visibleItems = outcomeVerificationItems.filter((item) => {
  const signal = item.signal;
  const haystack = `${signal.match ?? ""} ${getSignalTarget(signal)} ${getSignalType(signal)} ${item.source}`.toLowerCase();
  const matchesSearch = haystack.includes(search.trim().toLowerCase());
  const matchesFilter =
    filter === "all" ||
    (filter === "high" && signal.severity?.toUpperCase() === "HIGH") ||
    (filter === "field" && (signal.evidence?.scoresContext?.fieldPressureScore ?? 0) >= 22) ||
    (filter === "settled" && !["", "pending"].includes((signal.resultStatus ?? "pending").toLowerCase()));
  return matchesSearch && matchesFilter;
});
```

Render a compact header, summary strip, search/filter toolbar, desktop table-like rows that stack on mobile, explicit evidence rail, empty states, and the three existing analysis components in their specified regions. Each row's button must call `onSelectSignal(item.signal)` and include the match in its accessible name.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `cd apps/web && node_modules/.bin/vitest.cmd run src/features/signals/SignalsPage.smoke.test.tsx`

Expected: all Signals page tests pass.

- [ ] **Step 5: Verify the entire web application**

Run:

```powershell
cd apps/web
node_modules/.bin/vitest.cmd run
node_modules/.bin/eslint.cmd .
node_modules/.bin/tsc.cmd -b
node_modules/.bin/vite.cmd build
```

Expected: all tests pass; lint, TypeScript, and Vite build exit 0. The existing Vite bundle-size advisory may remain informational.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -f docs/superpowers/specs/2026-07-14-signals-triage-workspace-design.md docs/superpowers/plans/2026-07-14-signals-triage-workspace.md
git add apps/web/src/features/signals/SignalsPage.tsx apps/web/src/features/signals/SignalsPage.smoke.test.tsx
git commit -m "feat: redesign signals triage workspace"
```
