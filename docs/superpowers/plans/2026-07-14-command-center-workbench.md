# Command Center Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sparse equal-height Command Center rows with a responsive operator workbench that prioritizes signal, evidence, action, and trust.

**Architecture:** Extend the shared `SectionHeader` with explicit density and subtitle variants, then compose one semantic workbench from independently flowing left and right columns. Keep all existing data contracts and polling behavior; change only presentation, grouping, and responsive ordering.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, Recharts 3, Vitest, Testing Library, Vite 8.

## Global Constraints

- Preserve existing API endpoints, data contracts, navigation callbacks, and guided-tour target IDs.
- Use the existing 4px Tailwind spacing scale; no arbitrary page spacing or z-index values.
- Keep interactive targets at least 44px high and retain visible keyboard focus behavior.
- Preserve the instrument-console palette; amber is reserved for the priority signal, selected state, and primary action.
- Do not add dependencies, fabricated data, decorative animation, nested cards, glass effects, or framework migration.
- Support 320px, 390px, 768px, 1024px, and 1440px viewport widths without page-level horizontal overflow.

---

### Task 1: Density-aware shared section header

**Files:**
- Create: `apps/web/src/components/ui/SectionHeader.test.tsx`
- Modify: `apps/web/src/components/ui/SectionHeader.tsx`

**Interfaces:**
- Consumes: `eyebrow: string`, `title: string`, and optional `action: ReactNode`.
- Produces: optional `subtitle?: string` and `size?: "compact" | "standard" | "primary"` while preserving existing calls.

- [ ] **Step 1: Write the failing header tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("renders an optional subtitle as part of the heading group", () => {
    render(<SectionHeader eyebrow="Selected fixture" title="Market Pulse" subtitle="Norway vs England" />);
    expect(screen.getByRole("heading", { name: "Market Pulse" })).toBeInTheDocument();
    expect(screen.getByText("Norway vs England")).toBeInTheDocument();
  });

  it("supports compact and primary density without changing the heading level", () => {
    const { rerender } = render(<SectionHeader eyebrow="Trust" title="Verification" size="compact" />);
    expect(screen.getByTestId("section-header")).toHaveAttribute("data-size", "compact");
    rerender(<SectionHeader eyebrow="Priority" title="Top signal" size="primary" />);
    expect(screen.getByTestId("section-header")).toHaveAttribute("data-size", "primary");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd run test -- SectionHeader.test.tsx`

Expected: FAIL because `subtitle`, `size`, and `data-size` do not exist.

- [ ] **Step 3: Implement the density-aware header**

```tsx
export interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  size?: "compact" | "standard" | "primary";
  action?: ReactNode;
}

const SIZE_STYLES = {
  compact: { root: "mb-2", title: "text-sm", eyebrow: "text-[10px]" },
  standard: { root: "mb-3", title: "text-lg", eyebrow: "text-[10px]" },
  primary: { root: "mb-4", title: "text-xl", eyebrow: "text-[11px]" },
} as const;
```

Render `data-testid="section-header"`, `data-size={size}`, the existing eyebrow and `h2`, then `subtitle` as `mt-0.5 text-xs text-stone-500`. Default `size` to `standard`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd run test -- SectionHeader.test.tsx`

Expected: 2 tests passed.

- [ ] **Step 5: Commit the header contract**

```powershell
git add apps/web/src/components/ui/SectionHeader.tsx apps/web/src/components/ui/SectionHeader.test.tsx
git commit -m "add density-aware section headers"
```

---

### Task 2: Independent-column operator workbench

**Files:**
- Modify: `apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx`
- Modify: `apps/web/src/features/overview/CommandCenterPage.tsx`

**Interfaces:**
- Consumes: the unchanged `CommandCenterPageProps` interface and Task 1's `SectionHeader` `size`/`subtitle` props.
- Produces: semantic regions named `Priority signal`, `Command actions and live context`, `Market evidence`, `Decision audit`, and `Trust and system status`.

- [ ] **Step 1: Write failing workbench semantics and action-flow tests**

Add assertions to the representative-data test:

```tsx
expect(screen.getByRole("region", { name: "Priority signal" })).toBeInTheDocument();
expect(screen.getByRole("complementary", { name: "Command actions and live context" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Market evidence" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Decision audit" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Trust and system status" })).toBeInTheDocument();
expect(screen.getByTestId("command-workbench")).toHaveAttribute("data-layout", "independent-columns");
```

Import `fireEvent` from `@testing-library/react`, then add one navigation test:

```tsx
it("routes the operator from the priority signal to evidence and verification", async () => {
  const onNavigate = vi.fn();
  render(<CommandCenterPage {...baseProps} onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole("button", { name: "Inspect signal" }));
  fireEvent.click(screen.getByRole("button", { name: "Open verification" }));
  expect(onNavigate).toHaveBeenNthCalledWith(1, "signals");
  expect(onNavigate).toHaveBeenNthCalledWith(2, "verification");
});
```

- [ ] **Step 2: Run the focused page test and verify RED**

Run: `npm.cmd run test -- CommandCenterPage.smoke.test.tsx`

Expected: FAIL because the semantic regions and independent workbench marker do not exist.

- [ ] **Step 3: Build the independent desktop workbench**

In `CommandCenterPage.tsx`:

- Wrap content in `mx-auto w-full max-w-[1600px] space-y-6`.
- Replace the separate KPI, priority/action, and chart/feed rows with `data-testid="command-workbench" data-layout="independent-columns"` and `grid gap-4 lg:grid-cols-12`.
- Left stack: `space-y-4 lg:col-span-8`, containing the priority signal region and Market evidence region.
- Right `aside`: `space-y-4 lg:col-span-4`, containing actions, a compact 2×2 metric grid, and Decision audit.
- Move the four existing KPI values into compact metric cells with uniform chrome and no nested `Card` components.
- Use `SectionHeader size="primary"` for the priority signal, `standard` for Market Pulse, and `compact` for actions/decision modules.
- Replace the fixture label negative margin with `subtitle={selectedFixtureLabel}`.
- Preserve `id="guide-decision-feed"` on the decision region.

- [ ] **Step 4: Consolidate trust utilities**

Replace the three bottom cards with one `section aria-label="Trust and system status"` using a single `Card` and three divider-separated utility cells. Each cell has a short label, a concise value, and its existing semantic tone. Keep Strategy Leader, Verification, and System Health copy and data; remove their repeated large headers and nested status-card treatment.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `npm.cmd run test -- CommandCenterPage.smoke.test.tsx SectionHeader.test.tsx`

Expected: all focused tests passed.

- [ ] **Step 6: Commit the workbench topology**

```powershell
git add apps/web/src/features/overview/CommandCenterPage.tsx apps/web/src/features/overview/CommandCenterPage.smoke.test.tsx
git commit -m "reshape command center as operator workbench"
```

---

### Task 3: Responsive density, layout audit, and release verification

**Files:**
- Modify: `apps/web/src/features/overview/CommandCenterPage.tsx`
- Modify only if required by verified behavior: `apps/web/src/app/AppShell.tsx`

**Interfaces:**
- Consumes: Task 2 semantic regions and unchanged GoalPulse data/navigation contracts.
- Produces: viewport-specific chart sizing, mobile metric/utility rails, and tablet topology with no page overflow.

- [ ] **Step 1: Add responsive behavior in the existing workbench**

Apply these exact rules:

- Chart: `h-52 sm:h-60 lg:h-72`.
- Workbench gutter: `gap-3 sm:gap-4`.
- Priority card: `p-4 lg:p-5`; compact cards: `p-3 sm:p-4`.
- Metric rail: `grid grid-cols-2 gap-2` on mobile/right rail; remove widget `min-w` constraints by rendering compact cells directly.
- Utility strip: `overflow-x-auto`; inner row `grid min-w-[42rem] grid-cols-3` below `md`, switching to `min-w-0` at `md`.
- Major content stacks use `space-y-3 sm:space-y-4`; the outer page uses `space-y-4 lg:space-y-6`.
- Tablet keeps priority full-width and uses two columns for actions/metrics when the main grid has not reached desktop; do not render three narrow summary cards.

- [ ] **Step 2: Run the mechanical layout detector**

Run:

```powershell
node C:\Projects\goalpulse-agent\.agents\skills\impeccable\scripts\detect.mjs --json --scope layout apps/web/src/features/overview/CommandCenterPage.tsx apps/web/src/components/ui/SectionHeader.tsx
```

Expected: `[]`.

- [ ] **Step 3: Run full automated verification**

Run in parallel:

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: all tests pass, ESLint exits 0, Vite build exits 0, and diff check reports no whitespace errors. Record the Vite chunk-size warning honestly if it remains.

- [ ] **Step 4: Verify responsive behavior in a browser**

At 1440px, 1024px, 768px, 390px, and 320px:

- Confirm no page-level horizontal overflow.
- Confirm the primary signal is first and visually dominant.
- Confirm actions and live metrics are visible without tall empty regions.
- Confirm the chart uses 288px/240px/208px heights at desktop/tablet/mobile.
- Confirm only the explicit utility rail scrolls horizontally on narrow screens.
- Exercise Inspect signal, Open verification, sidebar navigation, and product-tour spotlight targets.

- [ ] **Step 5: Commit responsive polish**

```powershell
git add apps/web/src/features/overview/CommandCenterPage.tsx apps/web/src/app/AppShell.tsx
git commit -m "polish command center responsive density"
```
