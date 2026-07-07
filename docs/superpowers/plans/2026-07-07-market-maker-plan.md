# In-Play Market Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone in-play market maker that quotes a bid/ask spread around TxLINE's own fair odds, widening with field pressure and data-reliability problems, exposed via a new endpoint, documented in the OpenAPI spec, and visualized in a new dashboard panel.

**Architecture:** A pure function module (`apps/api/src/logic/marketMaker.ts`) computed live at request time from existing store data via a new `GET /api/market-maker` route — no changes to `agent.ts` or `store.ts`'s mutable state. A new frontend panel polls that endpoint.

**Tech Stack:** TypeScript, Express, Vitest, React (existing stack, no new dependencies).

## Global Constraints

- Must not touch or destabilize the existing signal engine, P&L, or settlement logic — reads the same underlying data but is a new, independent computation (spec: "Goals").
- Computed live at request time, not stored/persisted, not touching `agent.ts`'s cycle loop at all (spec: "Data flow: live-computed, not stored").
- `bidOdds` must never go below `1.01` (the decimal-odds floor bug caught and fixed during design review) (spec: "Formula").
- Spread applied uniformly to home/away/draw — one `spreadPct` per match, not per side (spec: "Formula").
- `RELIABLE` and `UNKNOWN` reliability both get zero reliability-contribution penalty, matching the existing momentum score's own precedent (spec: "Formula").
- `round`/`clamp` helpers are local, independent copies in the new module — not imported from `signalEngine.ts` (spec: "Location and structure").
- Over/Under totals snapshots are explicitly out of scope for this pass — no special-casing (spec: "Non-goals").
- No new npm dependencies.

---

### Task 1: Type, pure logic module, and tests

**Files:**
- Modify: `apps/api/src/types.ts`
- Create: `apps/api/src/logic/marketMaker.ts`
- Create: `apps/api/src/logic/marketMaker.test.ts`

**Interfaces:**
- Produces: `export interface MarketMakerQuote` (in `types.ts`); `export function computeMarketMakerQuote(match: Match, snapshot: OddsSnapshot): MarketMakerQuote` (in `marketMaker.ts`). Task 2 imports both.

- [ ] **Step 1: Add the `MarketMakerQuote` type**

In `apps/api/src/types.ts`, the file currently ends with:

```ts
export interface AgentRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  matchesProcessed: number;
  snapshotsCreated: number;
  signalsCreated: number;
  status: "success" | "error";
  message: string;
}
```

Add directly after it:

```ts
export interface AgentRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  matchesProcessed: number;
  snapshotsCreated: number;
  signalsCreated: number;
  status: "success" | "error";
  message: string;
}

export interface MarketMakerQuote {
  matchId: string;
  match: string;
  fairOdds: { home: number; away: number; draw: number };
  bidOdds: { home: number; away: number; draw: number };
  askOdds: { home: number; away: number; draw: number };
  spreadPct: number;
  spreadWidth: "NARROW" | "MODERATE" | "WIDE";
  reason: string;
  fieldPressureScore: number;
  reliability: "RELIABLE" | "UNRELIABLE" | "SUSPENDED" | "UNKNOWN";
  computedAt: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/logic/marketMaker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeMarketMakerQuote } from "./marketMaker";
import type { Match, OddsSnapshot } from "../types";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "Test Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    status: "live",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snapshot-1",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 3.5,
    drawOdds: 3.2,
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    source: "txline",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeMarketMakerQuote", () => {
  it("quotes the narrowest 2% spread when reliable and no field pressure", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 0, reliability: "RELIABLE" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.spreadPct).toBe(2);
    expect(quote.spreadWidth).toBe("NARROW");
  });

  it("quotes the widest 16% spread when suspended and HIGH_DANGER pressure", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 45, reliability: "SUSPENDED" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.spreadPct).toBe(16);
    expect(quote.spreadWidth).toBe("WIDE");
  });

  it("computes the exact spread for an UNRELIABLE, ATTACK-pressure moment", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 22, reliability: "UNRELIABLE" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    // 2 + (22/45)*6 + 4 = 2 + 2.9333... + 4 = 8.93 (rounded to 2 decimals)
    expect(quote.spreadPct).toBe(8.93);
    expect(quote.spreadWidth).toBe("MODERATE");
  });

  it("defaults to fieldPressureScore 0 and reliability UNKNOWN when scoresContext is missing", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({ evidence: undefined });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.fieldPressureScore).toBe(0);
    expect(quote.reliability).toBe("UNKNOWN");
    expect(quote.spreadPct).toBe(2);
  });

  it("never quotes a bid below the 1.01 decimal-odds floor for a heavy favorite", () => {
    const match = makeMatch();
    // 1.04 is a real odds value observed in this app's own production data
    // (Colombia vs Ghana). At the worst-case 16% spread this would otherwise
    // compute to 1.04 * 0.92 = 0.957, an invalid decimal odds value.
    const snapshot = makeSnapshot({
      homeOdds: 1.04,
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 45, reliability: "SUSPENDED" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.bidOdds.home).toBeGreaterThanOrEqual(1.01);
  });

  it("always keeps bid < fair < ask for every side", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 32, reliability: "UNRELIABLE" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    for (const side of ["home", "away", "draw"] as const) {
      expect(quote.bidOdds[side]).toBeLessThan(quote.fairOdds[side]);
      expect(quote.fairOdds[side]).toBeLessThan(quote.askOdds[side]);
    }
  });

  it("labels spread width NARROW at the exact 4% boundary", () => {
    const match = makeMatch();
    // fieldPressureScore=15 gives pressureContribution = (15/45)*6 = 2 exactly,
    // for a total of 2 (base) + 2 = 4% - the NARROW/MODERATE boundary.
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 15, reliability: "RELIABLE" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.spreadPct).toBe(4);
    expect(quote.spreadWidth).toBe("NARROW");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: FAIL — `marketMaker.test.ts` cannot resolve `./marketMaker` (module does not exist yet). The other 24 existing tests still pass.

- [ ] **Step 4: Write the pure logic module**

Create `apps/api/src/logic/marketMaker.ts`:

```ts
import { Match, MarketMakerQuote, OddsSnapshot } from "../types";

const BASE_SPREAD_PCT = 2;
const MAX_PRESSURE_CONTRIBUTION_PCT = 6;
const FIELD_PRESSURE_MAX = 45;
const UNRELIABLE_PENALTY_PCT = 4;
const SUSPENDED_PENALTY_PCT = 8;
const MIN_SPREAD_PCT = 2;
const MAX_SPREAD_PCT = 20;
const MIN_BID_ODDS = 1.01;

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSpreadWidth(spreadPct: number): "NARROW" | "MODERATE" | "WIDE" {
  if (spreadPct <= 4) return "NARROW";
  if (spreadPct <= 10) return "MODERATE";
  return "WIDE";
}

function buildReason(
  spreadWidth: "NARROW" | "MODERATE" | "WIDE",
  fieldPressureScore: number,
  reliability: MarketMakerQuote["reliability"]
): string {
  const pressureNote =
    fieldPressureScore >= 32
      ? "high field pressure"
      : fieldPressureScore >= 22
        ? "moderate field pressure"
        : fieldPressureScore > 0
          ? "low field pressure"
          : "no notable field pressure";

  const reliabilityNote =
    reliability === "SUSPENDED"
      ? "suspended/unreliable data"
      : reliability === "UNRELIABLE"
        ? "unreliable data"
        : reliability === "UNKNOWN"
          ? "no field context available"
          : "reliable data";

  const label =
    spreadWidth === "NARROW"
      ? "Narrow"
      : spreadWidth === "MODERATE"
        ? "Moderate"
        : "Wide";

  return `${label}: ${pressureNote} + ${reliabilityNote}`;
}

function quoteSide(fairOdds: number, halfSpread: number) {
  return {
    fairOdds: round(fairOdds),
    bidOdds: round(Math.max(MIN_BID_ODDS, fairOdds * (1 - halfSpread))),
    askOdds: round(fairOdds * (1 + halfSpread)),
  };
}

/**
 * Computes a defensible bid/ask spread around TxLINE's already-de-margined
 * fair odds for a match's outcomes. The spread widens with fieldPressureScore
 * (more dramatic in-play action = more uncertainty) and with reliability
 * problems (UNRELIABLE/SUSPENDED - quoting confidently on bad data is exactly
 * what a real market maker avoids). RELIABLE and UNKNOWN both get no
 * reliability penalty, matching the existing momentum score's own precedent
 * of not penalizing UNKNOWN (no scores event available is not evidence of bad
 * data, just absent context).
 *
 * Always computable from a single snapshot - unlike buildSignalFromSnapshots,
 * this needs no previous snapshot to compare against, so there is no null
 * case.
 */
export function computeMarketMakerQuote(
  match: Match,
  snapshot: OddsSnapshot
): MarketMakerQuote {
  const scoresContext = snapshot.evidence?.scoresContext;
  const fieldPressureScore = scoresContext?.fieldPressureScore ?? 0;
  const reliability = scoresContext?.reliability ?? "UNKNOWN";

  const pressureContribution =
    (fieldPressureScore / FIELD_PRESSURE_MAX) * MAX_PRESSURE_CONTRIBUTION_PCT;
  const reliabilityContribution =
    reliability === "SUSPENDED"
      ? SUSPENDED_PENALTY_PCT
      : reliability === "UNRELIABLE"
        ? UNRELIABLE_PENALTY_PCT
        : 0;

  const spreadPct = round(
    clamp(
      BASE_SPREAD_PCT + pressureContribution + reliabilityContribution,
      MIN_SPREAD_PCT,
      MAX_SPREAD_PCT
    )
  );
  const halfSpread = spreadPct / 200;
  const spreadWidth = getSpreadWidth(spreadPct);
  const reason = buildReason(spreadWidth, fieldPressureScore, reliability);

  const home = quoteSide(snapshot.homeOdds, halfSpread);
  const away = quoteSide(snapshot.awayOdds, halfSpread);
  const draw = quoteSide(snapshot.drawOdds, halfSpread);

  return {
    matchId: match.id,
    match: `${match.homeTeam} vs ${match.awayTeam}`,
    fairOdds: { home: home.fairOdds, away: away.fairOdds, draw: draw.fairOdds },
    bidOdds: { home: home.bidOdds, away: away.bidOdds, draw: draw.bidOdds },
    askOdds: { home: home.askOdds, away: away.askOdds, draw: draw.askOdds },
    spreadPct,
    spreadWidth,
    reason,
    fieldPressureScore,
    reliability,
    computedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 31 tests (24 existing + 7 new) pass.

- [ ] **Step 6: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output (clean `tsc` run).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/logic/marketMaker.ts apps/api/src/logic/marketMaker.test.ts
git commit -m "Add market maker quote formula with tests"
```

---

### Task 2: Wire the endpoint into server.ts and document it in openapi.yaml

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: `computeMarketMakerQuote` from `./logic/marketMaker`, `findPreviousSnapshot` from `./store` (Task 1 and existing `store.ts`).

- [ ] **Step 1: Add the imports**

In `apps/api/src/server.ts`, find the current store import:

```ts
import { getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
```

Replace with:

```ts
import { findPreviousSnapshot, getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
```

Then find the import block that includes `buildSignalFromSnapshots`:

```ts
import { buildSignalFromSnapshots } from "./logic/signalEngine";
```

Add a line after it:

```ts
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { computeMarketMakerQuote } from "./logic/marketMaker";
```

- [ ] **Step 2: Add the route**

Find the existing `/api/odds-history` route:

```ts
app.get("/api/odds-history", (req, res) => {
  const matchId = String(req.query.matchId ?? "");

  const snapshots = matchId
    ? store.oddsSnapshots.filter((snapshot) => snapshot.matchId === matchId)
    : store.oddsSnapshots;

  res.json({
    data: snapshots.slice(0, 100).reverse(),
  });
});
```

Add the new route directly after it:

```ts
app.get("/api/odds-history", (req, res) => {
  const matchId = String(req.query.matchId ?? "");

  const snapshots = matchId
    ? store.oddsSnapshots.filter((snapshot) => snapshot.matchId === matchId)
    : store.oddsSnapshots;

  res.json({
    data: snapshots.slice(0, 100).reverse(),
  });
});

app.get("/api/market-maker", (req, res) => {
  const matchId = String(req.query.matchId ?? "");

  const matches = matchId
    ? store.matches.filter((match) => match.id === matchId)
    : store.matches;

  const quotes = matches
    .map((match) => {
      const snapshot = findPreviousSnapshot(match.id);
      return snapshot ? computeMarketMakerQuote(match, snapshot) : null;
    })
    .filter((quote): quote is NonNullable<typeof quote> => quote !== null);

  res.json({
    data: quotes,
  });
});
```

- [ ] **Step 3: Add the OpenAPI schema**

In `openapi.yaml`, find the end of the `OddsStreamEvent` schema (immediately before the `responses:` section):

```yaml
    OddsStreamEvent:
      type: object
      properties:
        matchId: { type: string }
        timestamp: { type: string, format: date-time }
        match:
          $ref: '#/components/schemas/Match'
        latestSnapshot:
          $ref: '#/components/schemas/OddsSnapshot'
        history:
          type: array
          items:
            $ref: '#/components/schemas/OddsSnapshot'
        signals:
          type: array
          items:
            $ref: '#/components/schemas/AgentSignal'
        stats:
          $ref: '#/components/schemas/Stats'
        streamMode: { type: string, enum: [replay_test] }
        replayCursor: { type: number }
        replayTotal: { type: number }
        replayComplete: { type: boolean }
      required: [matchId, timestamp, history, signals, stats]

  responses:
    RateLimited:
```

Replace with (adding the new `MarketMakerQuote` schema between `OddsStreamEvent` and `responses:`):

```yaml
    OddsStreamEvent:
      type: object
      properties:
        matchId: { type: string }
        timestamp: { type: string, format: date-time }
        match:
          $ref: '#/components/schemas/Match'
        latestSnapshot:
          $ref: '#/components/schemas/OddsSnapshot'
        history:
          type: array
          items:
            $ref: '#/components/schemas/OddsSnapshot'
        signals:
          type: array
          items:
            $ref: '#/components/schemas/AgentSignal'
        stats:
          $ref: '#/components/schemas/Stats'
        streamMode: { type: string, enum: [replay_test] }
        replayCursor: { type: number }
        replayTotal: { type: number }
        replayComplete: { type: boolean }
      required: [matchId, timestamp, history, signals, stats]

    MarketMakerQuote:
      type: object
      properties:
        matchId: { type: string }
        match: { type: string }
        fairOdds:
          type: object
          properties:
            home: { type: number }
            away: { type: number }
            draw: { type: number }
          required: [home, away, draw]
        bidOdds:
          type: object
          properties:
            home: { type: number }
            away: { type: number }
            draw: { type: number }
          required: [home, away, draw]
        askOdds:
          type: object
          properties:
            home: { type: number }
            away: { type: number }
            draw: { type: number }
          required: [home, away, draw]
        spreadPct: { type: number }
        spreadWidth: { type: string, enum: [NARROW, MODERATE, WIDE] }
        reason: { type: string }
        fieldPressureScore: { type: number }
        reliability: { type: string, enum: [RELIABLE, UNRELIABLE, SUSPENDED, UNKNOWN] }
        computedAt: { type: string, format: date-time }
      required: [matchId, match, fairOdds, bidOdds, askOdds, spreadPct, spreadWidth, reason, fieldPressureScore, reliability, computedAt]

  responses:
    RateLimited:
```

- [ ] **Step 4: Add the OpenAPI path entry**

In `openapi.yaml`, find the `/api/odds-history` path entry:

```yaml
  /api/odds-history:
    get:
      summary: Odds snapshot history
      description: Up to the 100 most recent odds snapshots, newest first, optionally filtered to a single match.
      parameters:
        - name: matchId
          in: query
          required: false
          schema:
            type: string
          description: Filter to a single match/market id. Omit for all matches combined.
      responses:
        '200':
          description: List of odds snapshots.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/OddsSnapshot'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'
```

Add the new path directly after it:

```yaml
  /api/odds-history:
    get:
      summary: Odds snapshot history
      description: Up to the 100 most recent odds snapshots, newest first, optionally filtered to a single match.
      parameters:
        - name: matchId
          in: query
          required: false
          schema:
            type: string
          description: Filter to a single match/market id. Omit for all matches combined.
      responses:
        '200':
          description: List of odds snapshots.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/OddsSnapshot'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'

  /api/market-maker:
    get:
      summary: In-play market maker bid/ask quotes
      description: >
        Quotes a bid/ask spread around the current fair odds (TxLINE's own
        de-margined price) for each currently-tracked match's home/away/draw
        outcomes. The spread widens with fieldPressureScore (more dramatic
        in-play action) and with TXODDS reliability problems
        (UNRELIABLE/SUSPENDED), and narrows in calm, reliable conditions -
        genuine market-making logic, not an arbitrary number. Computed live
        from already-autonomously-updated data; not stored or cached.
      parameters:
        - name: matchId
          in: query
          required: false
          schema:
            type: string
          description: Filter to a single match. Omit for one quote per currently-tracked match with an available odds snapshot.
      responses:
        '200':
          description: List of market maker quotes.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/MarketMakerQuote'
                required: [data]
        '429':
          $ref: '#/components/responses/RateLimited'
```

- [ ] **Step 5: Validate the OpenAPI spec**

Run: `cd C:\Projects\goalpulse-agent && npx @redocly/cli lint openapi.yaml`
Expected: `Woohoo! Your API description is valid.` with 0 errors (only the same pre-existing cosmetic warnings as before this change — missing `operationId`, missing `license`, `localhost` server entry).

- [ ] **Step 6: Verify the project builds and tests pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 31 tests pass.

- [ ] **Step 7: Manually verify the endpoint against a local dev server**

Check an unused port first (this session's established lesson: verify before starting, kill by exact PID afterward, never by `pkill` pattern):

Run: `netstat -ano | grep ":4004" | grep LISTENING || echo "port 4004 free"`

Start the dev server:

Run: `cd C:\Projects\goalpulse-agent\apps\api && PORT=4004 npm.cmd run dev`

In a second terminal:

Run: `curl -s http://127.0.0.1:4004/api/market-maker`
Expected: `200` with a JSON body shaped like `{"data":[...]}` — an array (possibly empty if no odds snapshots have been ingested yet in this dev session, which is a valid, non-error state).

Find the PID and stop the server:

Run: `netstat -ano | grep ":4004" | grep LISTENING`
Run: `powershell -Command "Stop-Process -Id <pid> -Force"` (substitute the actual PID)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/server.ts openapi.yaml
git commit -m "Add GET /api/market-maker endpoint and OpenAPI documentation"
```

---

### Task 3: Frontend panel

**Files:**
- Create: `apps/web/src/components/MarketMakerPanel.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/market-maker` (Task 2), via `fetch`.
- Produces: `export function MarketMakerPanel(): JSX.Element`, mounted in `App.tsx`.

- [ ] **Step 1: Create the panel component**

Create `apps/web/src/components/MarketMakerPanel.tsx`:

```tsx
import { Activity, Gauge } from "lucide-react";
import { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type MarketMakerQuote = {
  matchId: string;
  match: string;
  fairOdds: { home: number; away: number; draw: number };
  bidOdds: { home: number; away: number; draw: number };
  askOdds: { home: number; away: number; draw: number };
  spreadPct: number;
  spreadWidth: "NARROW" | "MODERATE" | "WIDE";
  reason: string;
  fieldPressureScore: number;
  reliability: "RELIABLE" | "UNRELIABLE" | "SUSPENDED" | "UNKNOWN";
  computedAt: string;
};

function formatOdds(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "--";
  return value.toFixed(2);
}

function spreadWidthClass(width: MarketMakerQuote["spreadWidth"]) {
  if (width === "NARROW") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (width === "MODERATE") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-red-400/20 bg-red-400/10 text-red-200";
}

function QuoteRow({
  label,
  fair,
  bid,
  ask,
}: {
  label: string;
  fair: number;
  bid: number;
  ask: number;
}) {
  return (
    <div className="rounded-2xl bg-black/25 p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[9px] text-stone-500">Bid</p>
          <p className="text-sm font-semibold text-emerald-200">{formatOdds(bid)}</p>
        </div>
        <div>
          <p className="text-[9px] text-stone-500">Fair</p>
          <p className="text-sm font-semibold text-white">{formatOdds(fair)}</p>
        </div>
        <div>
          <p className="text-[9px] text-stone-500">Ask</p>
          <p className="text-sm font-semibold text-orange-200">{formatOdds(ask)}</p>
        </div>
      </div>
    </div>
  );
}

export function MarketMakerPanel() {
  const [quotes, setQuotes] = useState<MarketMakerQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadQuotes() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/market-maker`);
        const payload = (await response.json()) as { data?: MarketMakerQuote[] };

        if (!mounted) return;

        setQuotes(payload.data ?? []);
      } catch (error) {
        console.error("Unable to load market maker quotes", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadQuotes();

    const timer = window.setInterval(loadQuotes, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const bestQuote = quotes[0];

  return (
    <section
      id="market-maker"
      className="rounded-[28px] border border-sky-400/20 bg-gradient-to-br from-[#0d1420] via-[#10141d] to-[#070708] p-5 shadow-2xl shadow-sky-950/20"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">
            <Gauge className="h-4 w-4" />
            In-Play Market Maker
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Live bid/ask quotes
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-400">
            Quotes a bid/ask spread around TxLINE's own de-margined fair odds.
            The spread widens with field pressure and data-reliability
            problems, and narrows in calm, reliable conditions.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-stone-400">
          Loading market maker quotes...
        </div>
      ) : bestQuote ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">{bestQuote.match}</h3>
              <span
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${spreadWidthClass(bestQuote.spreadWidth)}`}
              >
                {bestQuote.spreadWidth} · {bestQuote.spreadPct}%
              </span>
            </div>

            <p className="mb-4 text-xs leading-5 text-stone-400">{bestQuote.reason}</p>

            <div className="grid gap-2">
              <QuoteRow
                label="Home"
                fair={bestQuote.fairOdds.home}
                bid={bestQuote.bidOdds.home}
                ask={bestQuote.askOdds.home}
              />
              <QuoteRow
                label="Draw"
                fair={bestQuote.fairOdds.draw}
                bid={bestQuote.bidOdds.draw}
                ask={bestQuote.askOdds.draw}
              />
              <QuoteRow
                label="Away"
                fair={bestQuote.fairOdds.away}
                bid={bestQuote.bidOdds.away}
                ask={bestQuote.askOdds.away}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
              <Activity className="h-4 w-4" />
              Spread inputs
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl bg-[#0b0806] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Field Pressure Score</p>
                <p className="mt-1 text-xl font-semibold text-white">{bestQuote.fieldPressureScore}/45</p>
              </div>
              <div className="rounded-2xl bg-[#0b0806] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Reliability</p>
                <p className="mt-1 text-xl font-semibold text-white">{bestQuote.reliability}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-stone-400">
          Waiting for a live match with odds history to quote.
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire the import into App.tsx**

In `apps/web/src/App.tsx`, the current imports are:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { SignalIntelligencePanel } from "./components/SignalIntelligencePanel";
import { ResultsSettlementPanel } from "./components/ResultsSettlementPanel";
import { VerifiedCaseStudiesPanel } from "./components/VerifiedCaseStudiesPanel";
import { WhatChangedPanel } from "./components/WhatChangedPanel";
```

Add one import line after the `SignalIntelligencePanel` import:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { SignalIntelligencePanel } from "./components/SignalIntelligencePanel";
import { MarketMakerPanel } from "./components/MarketMakerPanel";
import { ResultsSettlementPanel } from "./components/ResultsSettlementPanel";
import { VerifiedCaseStudiesPanel } from "./components/VerifiedCaseStudiesPanel";
import { WhatChangedPanel } from "./components/WhatChangedPanel";
```

- [ ] **Step 3: Mount the panel**

Find the current mount point:

```tsx
          <div className="2xl:col-span-2">
            <SignalIntelligencePanel />
          </div>

          <ResultsSettlementPanel />

          <VerifiedCaseStudiesPanel />

          <WhatChangedPanel />
```

Replace with:

```tsx
          <div className="2xl:col-span-2">
            <SignalIntelligencePanel />
          </div>

          <MarketMakerPanel />

          <ResultsSettlementPanel />

          <VerifiedCaseStudiesPanel />

          <WhatChangedPanel />
```

- [ ] **Step 4: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\web && npm.cmd run build`
Expected: completes successfully (clean `tsc -b && vite build`, same chunk-size warning as before is expected and unrelated).

- [ ] **Step 5: Verify the panel content is present in the built bundle**

Run: `cd C:\Projects\goalpulse-agent\apps\web && grep -o "In-Play Market Maker" dist/assets/*.js | head -3`
Expected: at least one match, confirming the new component's content shipped in the production build (this project's established no-browser-tool verification method for frontend changes this session).

- [ ] **Step 6: Manually verify the dev server serves the page without errors**

Check an unused port first:

Run: `netstat -ano | grep ":5176" | grep LISTENING || echo "port 5176 free"`

Run: `cd C:\Projects\goalpulse-agent\apps\web && $env:VITE_API_BASE_URL="http://localhost:4004"; npm.cmd run dev -- --host 127.0.0.1 --port 5176 --strictPort` (PowerShell) or the bash equivalent `VITE_API_BASE_URL=http://localhost:4004 npm.cmd run dev -- --host 127.0.0.1 --port 5176 --strictPort`

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5176/`
Expected: `200`.

Find the PID and stop the server:

Run: `netstat -ano | grep ":5176" | grep LISTENING`
Run: `powershell -Command "Stop-Process -Id <pid> -Force"` (substitute the actual PID)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/MarketMakerPanel.tsx apps/web/src/App.tsx
git commit -m "Add MarketMakerPanel and mount it in the dashboard"
```

---

## Self-Review

**Spec coverage:**
- Corrected formula with the 1.01 bid-floor fix (spec: "Formula") → Task 1.
- `MarketMakerQuote` type, `computeMarketMakerQuote` pure function, local `round`/`clamp` helpers not imported from `signalEngine.ts` (spec: "Location and structure") → Task 1.
- Tests mirroring `signalEngine.test.ts`'s conventions, including the specific bid-floor regression test and the bid<fair<ask invariant (spec: "Testing") → Task 1.
- `GET /api/market-maker` endpoint, live-computed via `findPreviousSnapshot`, no changes to `agent.ts`/`store.ts` mutable state (spec: "Data flow: live-computed, not stored") → Task 2.
- OpenAPI schema and path documentation matching existing conventions exactly (spec: "Location and structure") → Task 2.
- Frontend panel matching `SignalIntelligencePanel.tsx`'s conventions, mounted after `SignalIntelligencePanel` (spec: "Location and structure") → Task 3.
- Non-goal (Over/Under totals not special-cased) → no task attempts to handle totals snapshots differently; the function operates generically on whatever `homeOdds`/`awayOdds`/`drawOdds` exist, exactly as scoped.

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete, either copied from the actual current file contents (confirmed by reading them during planning) or fully written new content.

**Type consistency:** `MarketMakerQuote` (Task 1) is used identically in `marketMaker.ts` (Task 1), `server.ts` (Task 2, via the endpoint's inferred return type), and `MarketMakerPanel.tsx` (Task 3, as a locally-duplicated but field-identical type, matching this codebase's existing convention of not sharing types between backend and frontend). `computeMarketMakerQuote(match, snapshot)` signature is used identically in Task 1 and Task 2.
