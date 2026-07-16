# Discord Community Header Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, accessible `Join community` link to the sticky dashboard header.

**Architecture:** Keep the invite URL and anchor inside the existing `TopStatusBar`. Separate the community action from `role="status"`; wrap both in a responsive right-side container so badges can scroll while the action remains visible.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Vitest, Testing Library

## Global Constraints

- Use exactly `https://discord.gg/vCsA8Wuwh`.
- No Discord SDK, request, webhook change, polling, dependency, analytics, or authentication flow.
- Open in a new tab with `rel="noreferrer"` and an accessible name that identifies Discord and the new tab.
- Preserve sticky header, navigation toggle, title, status semantics, and 44-pixel touch target.

---

### Task 1: Add the community action

**Files:**
- Modify: `apps/web/src/app/app.smoke.test.tsx`
- Modify: `apps/web/src/app/TopStatusBar.tsx`

**Interfaces:**
- Produces: one external anchor named `Join GoalPulse Discord community (opens in a new tab)`.
- Consumes: no new props; the community destination is global product navigation.

- [ ] **Step 1: Write the failing smoke test**

Add a TopStatusBar test that renders the component and asserts:

```tsx
const communityLink = screen.getByRole("link", {
  name: "Join GoalPulse Discord community (opens in a new tab)",
});
expect(communityLink).toHaveTextContent("Join community");
expect(communityLink).toHaveAttribute("href", "https://discord.gg/vCsA8Wuwh");
expect(communityLink).toHaveAttribute("target", "_blank");
expect(communityLink).toHaveAttribute("rel", "noreferrer");
expect(screen.getByRole("status", { name: "System status" })).not.toContainElement(communityLink);
```

- [ ] **Step 2: Verify RED**

From `apps/web`, run `npm.cmd test -- src/app/app.smoke.test.tsx`. Expect failure because the Discord link does not exist.

- [ ] **Step 3: Implement the minimal header action**

Import `MessageCircle`, wrap the status region and anchor in a responsive `min-w-0` flex container, keep the status region scrollable, and add:

```tsx
<a
  href="https://discord.gg/vCsA8Wuwh"
  target="_blank"
  rel="noreferrer"
  aria-label="Join GoalPulse Discord community (opens in a new tab)"
  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-proof/25 bg-proof/10 px-3 text-xs font-semibold text-proof-100 transition-colors hover:border-proof/45 hover:bg-proof/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-proof/70 motion-reduce:transition-none"
>
  <MessageCircle className="h-4 w-4" aria-hidden="true" />
  <span>Join community</span>
</a>
```

- [ ] **Step 4: Verify GREEN and regressions**

Run the focused smoke test, then `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build`. Expect no failures or errors; the existing Vite main-bundle advisory may remain.

- [ ] **Step 5: Commit, publish, and deploy**

Commit as `feat: add Discord community header link`, push, open a ready PR, wait for CI/Vercel, merge, and inspect desktop plus narrow production layouts for correct link attributes, visibility, overflow, and console health without navigating away from GoalPulse.
