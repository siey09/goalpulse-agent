# API Key Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect `POST /api/agent/run-once` (the only mutating endpoint) with a fail-closed API key check, with zero changes to any GET endpoint or the frontend.

**Architecture:** A single config field (`config.apiAccessKey`) sourced from `API_ACCESS_KEY`, checked by one small standalone Express middleware (`requireApiKey`) applied only to the one route that needs it.

**Tech Stack:** Node.js, Express, TypeScript, Vitest (existing stack, no new dependencies).

## Global Constraints

- No frontend changes of any kind — every GET endpoint stays exactly as-is (spec: "Goals").
- Fail-closed: if `API_ACCESS_KEY` is not set, the protected endpoint always rejects with 401, never silently allows access (spec: "Middleware").
- Header name is exactly `X-API-Key`, not `Authorization: Bearer` (spec: "Middleware" — avoids confusion with the existing TxLINE JWT `Authorization: Bearer` header used elsewhere in this codebase).
- Error responses use the existing `res.status(N).json({ error: "..." })` shape already used elsewhere in `server.ts` — no new error-response convention (spec: "Error handling").
- Only `POST /api/agent/run-once` gets protected — no other endpoint, no global middleware, no GET exclusion list (spec: "Alternatives considered" explicitly rejects the global-middleware approach).
- Exact error message text: `"API key not configured on the server."` (empty config key) and `"Invalid or missing API key."` (wrong/missing header) — copied verbatim from the spec.

---

### Task 1: Add `apiAccessKey` to config

**Files:**
- Modify: `apps/api/src/config.ts`

**Interfaces:**
- Produces: `config.apiAccessKey: string` — Task 2 reads this field.

- [ ] **Step 1: Add the field**

In `apps/api/src/config.ts`, the current file is:

```ts
import dotenv from "dotenv";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  agentIntervalMs: Number(process.env.AGENT_INTERVAL_MS ?? 3000),
  useSimulatedFeed: process.env.USE_SIMULATED_FEED !== "false",
  txlineApiBaseUrl:
    process.env.TXLINE_BASE_URL ??
    process.env.TXLINE_API_BASE_URL ??
    "https://txline.txodds.com",
  txlineApiKey:
    process.env.TXLINE_API_TOKEN ??
    process.env.TXLINE_API_KEY ??
    "",
};
```

Replace the `export const config = {...}` block with:

```ts
export const config = {
  port: Number(process.env.PORT ?? 4000),
  agentIntervalMs: Number(process.env.AGENT_INTERVAL_MS ?? 3000),
  useSimulatedFeed: process.env.USE_SIMULATED_FEED !== "false",
  txlineApiBaseUrl:
    process.env.TXLINE_BASE_URL ??
    process.env.TXLINE_API_BASE_URL ??
    "https://txline.txodds.com",
  txlineApiKey:
    process.env.TXLINE_API_TOKEN ??
    process.env.TXLINE_API_KEY ??
    "",
  apiAccessKey: process.env.API_ACCESS_KEY ?? "",
};
```

- [ ] **Step 2: Add the env var to `.env.example`**

The current `apps/api/.env.example` is:

```
PORT=4000
AGENT_INTERVAL_MS=5000
TXLINE_API_BASE_URL=
TXLINE_API_KEY=
USE_SIMULATED_FEED=true
```

Append a new line at the end:

```
PORT=4000
AGENT_INTERVAL_MS=5000
TXLINE_API_BASE_URL=
TXLINE_API_KEY=
USE_SIMULATED_FEED=true
# Protects POST /api/agent/run-once. Send it back as the X-API-Key header.
API_ACCESS_KEY=
```

- [ ] **Step 3: Verify the project still builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output (clean `tsc` run), matching the project's existing build behavior.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config.ts apps/api/.env.example
git commit -m "Add API_ACCESS_KEY to config"
```

---

### Task 2: Create the `requireApiKey` middleware with tests

**Files:**
- Create: `apps/api/src/middleware/apiKeyAuth.ts`
- Create: `apps/api/src/middleware/apiKeyAuth.test.ts`

**Interfaces:**
- Consumes: `config.apiAccessKey` from `../config` (Task 1).
- Produces: `export function requireApiKey(req: Request, res: Response, next: NextFunction): void` — Task 3 imports this into `server.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/middleware/apiKeyAuth.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { config } from "../config";
import { requireApiKey } from "./apiKeyAuth";

function makeMockResponse() {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };

  return res;
}

function makeMockRequest(headerValue?: string) {
  return {
    headers: headerValue === undefined ? {} : { "x-api-key": headerValue },
  } as unknown as Request;
}

describe("requireApiKey", () => {
  beforeEach(() => {
    config.apiAccessKey = "";
  });

  it("rejects with 401 when no key is configured on the server", () => {
    const req = makeMockRequest("anything");
    const res = makeMockResponse();
    const next = vi.fn();

    requireApiKey(req, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "API key not configured on the server." });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the header is missing or wrong", () => {
    config.apiAccessKey = "correct-key";

    const req = makeMockRequest("wrong-key");
    const res = makeMockResponse();
    const next = vi.fn();

    requireApiKey(req, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or missing API key." });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when the header matches", () => {
    config.apiAccessKey = "correct-key";

    const req = makeMockRequest("correct-key");
    const res = makeMockResponse();
    const next = vi.fn();

    requireApiKey(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: FAIL — `apiKeyAuth.test.ts` cannot resolve `./apiKeyAuth` (module does not exist yet). The other 17 existing tests still pass.

- [ ] **Step 3: Write the middleware**

Create `apps/api/src/middleware/apiKeyAuth.ts`:

```ts
import { NextFunction, Request, Response } from "express";
import { config } from "../config";

/**
 * Protects mutating endpoints with a simple shared API key. Fail-closed: if
 * API_ACCESS_KEY is not configured on the server, the endpoint always
 * rejects rather than silently allowing access — unlike this codebase's
 * fail-open pattern for optional integrations (Discord alerts, on-chain
 * validation), this is a security control, not an optional bonus feature.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.apiAccessKey) {
    res.status(401).json({ error: "API key not configured on the server." });
    return;
  }

  const providedKey = req.headers["x-api-key"];

  if (providedKey !== config.apiAccessKey) {
    res.status(401).json({ error: "Invalid or missing API key." });
    return;
  }

  next();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 20 tests (17 existing + 3 new) pass.

- [ ] **Step 5: Verify the project still builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/apiKeyAuth.ts apps/api/src/middleware/apiKeyAuth.test.ts
git commit -m "Add requireApiKey middleware with tests"
```

---

### Task 3: Wire the middleware into the run-once route

**Files:**
- Modify: `apps/api/src/server.ts:1-11` (imports)
- Modify: `apps/api/src/server.ts:786` (route registration)

**Interfaces:**
- Consumes: `requireApiKey` from `./middleware/apiKeyAuth` (Task 2).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, the current imports are:

```ts
import { createHash } from "crypto";
import cors from "cors";
import express from "express";
import { processAgentCycle } from "./agent";
import { fetchRecentTxLineResults } from "./services/txlineClient";
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { validateStatOnChain } from "./services/onchainValidation";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { config } from "./config";
import { getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
import type { OddsSnapshot } from "./types";
```

Add one import line after the `config` import:

```ts
import { createHash } from "crypto";
import cors from "cors";
import express from "express";
import { processAgentCycle } from "./agent";
import { fetchRecentTxLineResults } from "./services/txlineClient";
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { validateStatOnChain } from "./services/onchainValidation";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { config } from "./config";
import { requireApiKey } from "./middleware/apiKeyAuth";
import { getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
import type { OddsSnapshot } from "./types";
```

- [ ] **Step 2: Add the middleware to the route**

Find the exact current route registration:

```ts
app.post("/api/agent/run-once", async (_req, res) => {
  const run = await processAgentCycle();

  res.json({
    data: run,
  });
```

Replace the first line only:

```ts
app.post("/api/agent/run-once", requireApiKey, async (_req, res) => {
  const run = await processAgentCycle();

  res.json({
    data: run,
  });
```

- [ ] **Step 3: Run the full test suite**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 20 tests pass (this task doesn't add new tests; it verifies wiring didn't break anything).

- [ ] **Step 4: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

- [ ] **Step 5: Manually verify the endpoint rejects without a key**

Start the server locally:

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run dev`

In a second terminal, with no `API_ACCESS_KEY` set in `.env.local` (or set to a value and testing the wrong-key case), call the endpoint:

Run: `curl -i -X POST http://localhost:4000/api/agent/run-once`
Expected: `HTTP/1.1 401` with body `{"error":"API key not configured on the server."}` if `API_ACCESS_KEY` is unset, or `{"error":"Invalid or missing API key."}` if it's set but no header was sent.

Then set `API_ACCESS_KEY=test-key-123` in `apps/api/.env.local`, restart the dev server, and call:

Run: `curl -i -X POST -H "X-API-Key: test-key-123" http://localhost:4000/api/agent/run-once`
Expected: `HTTP/1.1 200` with a JSON body containing `"data"` (the agent run result) — same success response as before this change.

Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Protect POST /api/agent/run-once with requireApiKey"
```

---

## Self-Review

**Spec coverage:**
- Config field `apiAccessKey` (spec: "Config") → Task 1.
- `.env.example` documentation (spec: "Config") → Task 1.
- Fail-closed middleware with exact error text and `X-API-Key` header (spec: "Middleware") → Task 2.
- Route wiring, single line changed (spec: "Route wiring") → Task 3.
- Existing error-response shape reused (spec: "Error handling") → satisfied by construction in Task 2 (uses `res.status(N).json({ error: "..." })`, matching the existing convention).
- 3 test cases (spec: "Testing") → Task 2.
- No frontend changes (spec: "Goals") → no frontend file appears in any task.
- Confirmed no existing caller needs updating (spec: "Confirmed: no existing caller needs updating") → reflected in Task 3 Step 5's manual verification being the only place a header is ever sent, and it's a manual curl command, not a change to any existing caller.

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete and copied from either the actual current file contents (verified by reading them) or fully written new content.

**Type consistency:** `requireApiKey(req: Request, res: Response, next: NextFunction): void` in Task 2 is the exact signature Task 3 imports and uses as Express middleware (Express's `app.post(path, middleware, handler)` signature accepts this directly, no wrapper needed). `config.apiAccessKey: string` from Task 1 is read the same way in both Task 2's middleware and Task 2's tests (direct property mutation, matching the existing `store.test.ts` convention of mutating shared module state in `beforeEach`).
