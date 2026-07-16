# Ask GoalPulse Feature Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-LLM `/features` knowledge experience that exposes GoalPulse's implemented features, source-backed formulas, workflows, data sources, and limitations.

**Architecture:** A focused frontend catalog module owns feature content and deterministic command parsing. `App.tsx` routes slash commands ahead of existing live-data intents, while `AnalystChatWidget` renders structured index, detail, and help messages and sends card selections through the same command path.

**Tech Stack:** React 19, TypeScript 6, Vite, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- No LLM request, new backend route, new package, or paid service.
- Every formula and threshold must match current production source behavior.
- Existing natural-language live-data answers must remain functional.
- Catalog copy must state limitations and retain the analytics-only boundary.
- Interactive cards must be semantic buttons with keyboard-visible focus.

---

### Task 1: Deterministic feature knowledge module

**Files:**
- Create: `apps/web/src/lib/goalPulseFeatureCatalog.ts`
- Create: `apps/web/src/lib/goalPulseFeatureCatalog.test.ts`

**Interfaces:**
- Produces: `GoalPulseFeature`, `FeatureCategory`, `AnalystReply`, `GOALPULSE_FEATURES`, `parseGoalPulseCommand(question: string): AnalystReply | null`, and `findGoalPulseFeature(query: string): GoalPulseFeature | null`.

- [ ] **Step 1: Write failing catalog and parser tests**

Test that ids are unique; every entry has implementation, evidence, formulas/rules, and limitation text; `/features` returns all ids; `/features confidence` and `/features kelly criterion` resolve aliases; `/help` returns help; a normal question returns `null`; and an unknown feature returns a recoverable text reply.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm --prefix apps/web test -- goalPulseFeatureCatalog.test.ts`

Expected: FAIL because `goalPulseFeatureCatalog.ts` does not exist.

- [ ] **Step 3: Implement typed data and command parsing**

Define these stable shapes:

```ts
export type FeatureCategory = "live-intelligence" | "strategy" | "trust" | "operations";

export interface GoalPulseFeature {
  id: string;
  name: string;
  shortName: string;
  aliases: string[];
  category: FeatureCategory;
  summary: string;
  implementation: string[];
  formulas: string[];
  evidence: string;
  limitation: string;
}

export type AnalystReply =
  | { kind: "text"; content: string }
  | { kind: "feature-index"; content: string; featureIds: string[] }
  | { kind: "feature-detail"; content: string; featureId: string }
  | { kind: "help"; content: string };
```

Populate the 15 approved features from repository-backed behavior. Parse exact `/features`, `/features <query>`, `/feature <query>`, and `/help` commands case-insensitively. Prefer exact id/name/alias matches, then safe substring alias matching.

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npm --prefix apps/web test -- goalPulseFeatureCatalog.test.ts`

Expected: all catalog and parser tests PASS.

- [ ] **Step 5: Commit the knowledge module**

```bash
git add apps/web/src/lib/goalPulseFeatureCatalog.ts apps/web/src/lib/goalPulseFeatureCatalog.test.ts
git commit -m "feat: add Ask GoalPulse feature knowledge catalog"
```

### Task 2: Structured, clickable chat presentation

**Files:**
- Modify: `apps/web/src/components/AnalystChatWidget.tsx`
- Create: `apps/web/src/components/AnalystChatWidget.test.tsx`

**Interfaces:**
- Consumes: `AnalystReply`, `GOALPULSE_FEATURES`, and feature lookup from Task 1.
- Produces: `AnalystChatMessage { role; reply }` and prop `onCommand(command: string): void`.

- [ ] **Step 1: Write failing component tests**

Render the widget with a `feature-index` reply and assert all category headings plus representative feature buttons appear. Click `Composite Confidence` and assert `onCommand("/features confidence")`. Render a detail reply and assert the title, implementation flow, formula, evidence, and limitation. Render help and assert `/features <name>` guidance.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm --prefix apps/web test -- AnalystChatWidget.test.tsx`

Expected: FAIL because the widget only supports string content.

- [ ] **Step 3: Implement structured renderers and discovery controls**

Replace the string-only message body with a small renderer that branches on `reply.kind`. Use category-grouped feature buttons for the index and semantic `ol`, formula panel, evidence row, and limitation row for detail. Add starter chips for `/features` and `/help`, an `aria-live="polite"` message stream, visible `focus-visible` rings, and the placeholder `Ask live data or type /features…`.

- [ ] **Step 4: Run the component test and verify pass**

Run: `npm --prefix apps/web test -- AnalystChatWidget.test.tsx`

Expected: all widget tests PASS.

- [ ] **Step 5: Commit the structured UI**

```bash
git add apps/web/src/components/AnalystChatWidget.tsx apps/web/src/components/AnalystChatWidget.test.tsx
git commit -m "feat: render interactive GoalPulse feature guide"
```

### Task 3: App command routing and regression protection

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/AnalystChatWidget.test.tsx`

**Interfaces:**
- Consumes: `parseGoalPulseCommand` and `AnalystReply` from Task 1; `onCommand` from Task 2.
- Produces: one `submitAnalystQuestion(question: string)` path shared by typed input and feature-card commands.

- [ ] **Step 1: Add a failing interaction regression test**

Add a harness test proving a feature button can feed a command back through `onCommand`, and that ordinary text messages still render as text replies.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm --prefix apps/web test -- AnalystChatWidget.test.tsx`

Expected: FAIL until the shared command contract is wired.

- [ ] **Step 3: Route slash commands before live API intents**

Change `generateAnalystReply` to return `Promise<AnalystReply>`. Its first branch calls `parseGoalPulseCommand(question)` and immediately returns a local reply when present. Wrap every existing natural-language string response as `{ kind: "text", content }`. Extract the current send body into `submitAnalystQuestion(question)` and pass it to the widget as `onCommand` so clicks and typing share loading, history, and error behavior.

- [ ] **Step 4: Run focused and full web verification**

Run:

```bash
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Expected: all web tests PASS, lint exits 0, and Vite production build succeeds.

- [ ] **Step 5: Commit app integration**

```bash
git add apps/web/src/App.tsx apps/web/src/components/AnalystChatWidget.test.tsx
git commit -m "feat: route Ask GoalPulse knowledge commands"
```

### Task 4: Production-like verification and deployment

**Files:**
- Modify only if verification exposes a defect in the files above.

**Interfaces:**
- Consumes: completed `/features` flow.
- Produces: verified branch, GitHub push, pull request, merged deployment, and production smoke result.

- [ ] **Step 1: Run the local frontend and browser smoke test**

Open Ask GoalPulse, enter `/features`, inspect grouping and overflow, open Composite Confidence and Solana Verification details, run `/help`, and verify a normal `latest signal` question still follows the live-data path. Repeat at approximately 390px width and check browser console errors.

- [ ] **Step 2: Run final repository checks**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and only intentional files changed.

- [ ] **Step 3: Commit any verification fixes**

```bash
git add apps/web/src docs/superpowers/specs docs/superpowers/plans
git commit -m "fix: polish Ask GoalPulse feature discovery"
```

Skip this commit when no verification fix exists.

- [ ] **Step 4: Push, open, and merge the pull request**

Push `codex/ask-goalpulse-feature-catalog`, create a ready pull request describing zero-LLM behavior and verification evidence, confirm required checks, then merge into `main`.

- [ ] **Step 5: Verify production deployment**

Check the Vercel deployment and production site. Confirm `/features`, one detail card, `/help`, and mobile layout on the deployed URL. Report any hosting delay honestly rather than claiming deployment before production reflects the merge.
