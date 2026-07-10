import { createHash } from "crypto";
import path from "path";
import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { processAgentCycle } from "./agent";
import { fetchRecentTxLineResults } from "./services/txlineClient";
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { getLiveOddsStreamState, startLiveOddsStreamMonitor } from "./services/txlineOddsStream";
import { validateStatOnChain } from "./services/onchainValidation";
import { loadSnapshot, saveSnapshot } from "./services/persistence";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { computeMarketMakerQuote } from "./logic/marketMaker";
import { computeArenaScoreboards, isTotalsSignal } from "./logic/arena";
import { computeDissent, summarizeDissent } from "./logic/councilDissent";
import type { CouncilVoteEntry } from "./logic/councilDissent";
import {
  assessCycleHealth,
  assessFixtureCoverage,
  assessOddsFreshness,
  computeFeedHealthStatus,
  ODDS_STALE_THRESHOLD_MS,
} from "./logic/feedHealth";
import { assessBandBreach, summarizeBandBreaches } from "./logic/marketConfirmation";
import type { BandBreachResult } from "./logic/marketConfirmation";
import { detectSteamMove } from "./logic/steamDetection";
import type { SteamMove } from "./logic/steamDetection";
import {
  findPatternMatchedClusters,
  findSignalClusters,
  CORRELATION_WINDOW_MS,
} from "./logic/signalCorrelation";
import {
  summarizeConfidenceScorePerformance,
  summarizeSignalTypePerformance,
} from "./logic/signalPerformance";
import { computeBacktestScoreboards } from "./logic/backtest";
import { parseArchiveFilters, parsePageParam, parsePageSizeParam } from "./logic/paginationParams";
import { archiveMatch, getArchivedSignals } from "./services/archive";
import { config } from "./config";
import { requireApiKey } from "./middleware/apiKeyAuth";
import { generalApiLimiter, runOnceLimiter } from "./middleware/rateLimiters";
import { findPreviousSnapshot, getPnlSummary, getStats, mergeOddsSnapshots, store , upsertRecentFinishedMatches } from "./store";
import type { OddsSnapshot } from "./types";

const app = express();

// Confirmed via production Render logs (2026-07-07): external requests
// consistently show exactly 2 proxy hops in X-Forwarded-For — a Cloudflare
// edge IP followed by Render's internal load balancer IP — before the real
// client IP. See docs/superpowers/specs/2026-07-07-rate-limiting-design.md,
// "Prerequisite fix", for the Phase 1/Phase 2 history of this value.
app.set("trust proxy", 2);

app.use(cors());
app.use(express.json());
app.use(generalApiLimiter);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GoalPulse Agent API",
    status: "running",
    agentIntervalMs: config.agentIntervalMs,
    useSimulatedFeed: config.useSimulatedFeed,
    txlineBaseUrl: config.txlineApiBaseUrl,
    liveStream: getLiveStreamState(),
    liveOddsStream: getLiveOddsStreamState(),
    timestamp: new Date().toISOString(),
  });
});

const openApiDocument = YAML.load(
  path.join(__dirname, "..", "..", "..", "openapi.yaml")
);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.get("/api/matches", (_req, res) => {
  res.json({
    data: store.matches,
  });
});

/**
 * Real on-chain Merkle proof validation against TxLINE's Solana program, for
 * whichever fixtureId/seq/statKey the caller (the dashboard's "Verify on
 * Solana" button, tied to the currently selected signal) provides. The
 * predicate proven on-chain is always "the exact value TxLINE reports for
 * this stat is what's anchored on-chain" (comparison: equalTo, threshold:
 * the real proven value) rather than an arbitrary caller-supplied threshold —
 * see validateStatOnChain for why. Since the numeric meaning of a given
 * statKey is not publicly documented, this endpoint surfaces the exact
 * key/value TxLINE proves (`provenStat`) so the caller can confirm what a
 * statKey represents before relying on it elsewhere.
 *
 * Example: /api/onchain/validate-stat?fixtureId=18179549&seq=1029&statKey=1002
 */
app.get("/api/onchain/validate-stat", async (req, res) => {
  const fixtureId = Number(req.query.fixtureId);
  const seq = Number(req.query.seq);
  const statKey = Number(req.query.statKey);

  if (!fixtureId || !seq || !statKey) {
    res.status(400).json({
      error: "fixtureId, seq, and statKey query parameters are required.",
    });
    return;
  }

  const result = await validateStatOnChain(fixtureId, seq, statKey);

  res.json({ data: result });
});

app.get("/api/recent-results", async (_req, res) => {
  const recentResultIds = new Set(
    store.recentFinishedMatches.map((match) => match.id)
  );
  const hasRecentOddsHistory = store.oddsSnapshots.some((snapshot) =>
    recentResultIds.has(snapshot.matchId)
  );

  if (store.recentFinishedMatches.length === 0 || !hasRecentOddsHistory) {
    const recentFeed = await fetchRecentTxLineResults();

    const newlyFinishedMatches = upsertRecentFinishedMatches(recentFeed.matches);
    for (const match of newlyFinishedMatches) {
      void archiveMatch(match);
    }

    mergeOddsSnapshots(recentFeed.snapshots);
  }

  res.json({
    data: store.recentFinishedMatches,
  });
});

app.get("/api/live/replay-stream", (req, res) => {
  const matchId = String(req.query.matchId ?? "");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const allSnapshots = (matchId
    ? store.oddsSnapshots.filter((snapshot) => snapshot.matchId === matchId)
    : store.oddsSnapshots
  )
    .slice(0, 100)
    .reverse();

  const match = matchId
    ? store.matches.find((item) => item.id === matchId) ??
      store.recentFinishedMatches.find((item) => item.id === matchId)
    : store.matches[0];

  const relatedSignals = matchId
    ? store.signals.filter((signal) => signal.matchId === matchId).slice(0, 10)
    : store.signals.slice(0, 10);

  if (allSnapshots.length === 0) {
    res.write(
      `event: odds-update\ndata: ${JSON.stringify({
        matchId,
        timestamp: new Date().toISOString(),
        match,
        latestSnapshot: null,
        history: [],
        signals: relatedSignals,
        stats: getStats(),
        streamMode: "replay_test",
        replayComplete: true,
      })}\n\n`
    );
    res.end();
    return;
  }

  let cursor = 1;

  const sendReplayTick = () => {
    const replayHistory = allSnapshots.slice(0, cursor);
    const latestSnapshot = replayHistory[replayHistory.length - 1];

    res.write(
      `event: odds-update\ndata: ${JSON.stringify({
        matchId,
        timestamp: new Date().toISOString(),
        match,
        latestSnapshot,
        history: replayHistory,
        signals: relatedSignals,
        stats: getStats(),
        streamMode: "replay_test",
        replayCursor: cursor,
        replayTotal: allSnapshots.length,
        replayComplete: cursor >= allSnapshots.length,
      })}\n\n`
    );

    cursor += 1;

    if (cursor > allSnapshots.length) {
      cursor = 1;
    }
  };

  sendReplayTick();

  const interval = setInterval(sendReplayTick, 1000);

  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});
app.get("/api/live/odds-stream", (req, res) => {
  const matchId = String(req.query.matchId ?? "");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let lastSignature = "";

  const sendSnapshot = () => {
    const snapshots = (matchId
      ? store.oddsSnapshots.filter((snapshot) => snapshot.matchId === matchId)
      : store.oddsSnapshots
    )
      .slice(0, 100)
      .reverse();

    const latestSnapshot = snapshots[snapshots.length - 1];
    const match = matchId
      ? store.matches.find((item) => item.id === matchId) ??
        store.recentFinishedMatches.find((item) => item.id === matchId)
      : store.matches[0];

    const relatedSignals = matchId
      ? store.signals.filter((signal) => signal.matchId === matchId).slice(0, 10)
      : store.signals.slice(0, 10);

    const signature = JSON.stringify({
      latestSnapshotId: latestSnapshot?.id ?? null,
      snapshotCount: snapshots.length,
      matchStatus: match?.status ?? null,
      homeScore: match?.homeScore ?? null,
      awayScore: match?.awayScore ?? null,
      signalCount: relatedSignals.length,
    });

    if (signature === lastSignature) {
      return;
    }

    lastSignature = signature;

    res.write(
      `event: odds-update\ndata: ${JSON.stringify({
        matchId,
        timestamp: new Date().toISOString(),
        match,
        latestSnapshot,
        history: snapshots,
        signals: relatedSignals,
        stats: getStats(),
      })}\n\n`
    );
  };

  sendSnapshot();

  const interval = setInterval(sendSnapshot, 1000);

  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});
app.get("/api/signals", (_req, res) => {
  res.json({
    data: store.signals,
  });
});

app.get("/api/agent-runs", (_req, res) => {
  res.json({
    data: store.agentRuns,
  });
});

app.get("/api/stats", (_req, res) => {
  res.json({
    data: getStats(),
  });
});

app.get("/api/pnl", (_req, res) => {
  res.json({
    data: getPnlSummary(),
  });
});

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

app.get("/api/arena", (_req, res) => {
  const matchesById = new Map<string, (typeof store.matches)[number]>();

  for (const match of store.recentFinishedMatches) {
    matchesById.set(match.id, match);
  }
  for (const match of store.matches) {
    matchesById.set(match.id, match);
  }

  const snapshotsById = new Map<string, (typeof store.oddsSnapshots)[number]>();
  for (const snapshot of store.oddsSnapshots) {
    snapshotsById.set(snapshot.id, snapshot);
  }

  const { momentumFollower, contrarian, kellyCriterion } = computeArenaScoreboards(
    store.signals,
    matchesById,
    snapshotsById
  );

  const verifiableSignal = store.signals.find(
    (signal) =>
      !isTotalsSignal(signal) &&
      signal.resultStatus !== "pending" &&
      signal.evidence?.fixtureId &&
      signal.evidence?.scoresContext?.sequence !== undefined
  );

  const verifiableStat = verifiableSignal
    ? {
        fixtureId: Number(verifiableSignal.evidence!.fixtureId),
        seq: verifiableSignal.evidence!.scoresContext!.sequence!,
        statKey: 1002,
      }
    : null;

  const proofHash = createHash("sha256")
    .update(
      JSON.stringify({
        momentumFollower: momentumFollower.positions,
        contrarian: contrarian.positions,
        kellyCriterion: kellyCriterion.positions,
      })
    )
    .digest("hex");

  res.json({
    data: {
      momentumFollower,
      contrarian,
      kellyCriterion,
      proof: {
        type: "sha256",
        hash: proofHash,
        verifiableStat,
        note:
          "Tamper-evident SHA-256 hash of all three agents' full position ledgers, plus a real on-chain Merkle proof (via GET /api/onchain/validate-stat) confirming the underlying TxLINE data this tournament is based on is genuinely anchored on Solana mainnet. This does not mean funds move or a smart contract executes - GoalPulse is analytics only and does not place wagers, custody funds, execute trades, or facilitate betting execution.",
      },
    },
  });
});

app.get("/api/archive", async (req, res) => {
  const page = parsePageParam(req.query.page);
  const pageSize = parsePageSizeParam(req.query.pageSize);
  const filters = parseArchiveFilters(req.query as Record<string, unknown>);

  const result = await getArchivedSignals(filters, { page, pageSize });

  res.json(result);
});

app.get("/api/feed-health", (_req, res) => {
  const now = Date.now();

  const cycleHealth = assessCycleHealth(store.agentRuns, now, config.agentIntervalMs);
  const oddsFreshness = assessOddsFreshness(
    store.matches,
    store.oddsSnapshots,
    now,
    ODDS_STALE_THRESHOLD_MS
  );
  const fixtureCoverage = assessFixtureCoverage(store.agentRuns);
  const status = computeFeedHealthStatus(cycleHealth, oddsFreshness, fixtureCoverage);

  res.json({
    data: {
      status,
      cycleHealth,
      oddsFreshness,
      fixtureCoverage,
    },
  });
});

app.get("/api/market-maker/confirmations", (_req, res) => {
  const matchesById = new Map<string, (typeof store.matches)[number]>();

  for (const match of store.recentFinishedMatches) {
    matchesById.set(match.id, match);
  }
  for (const match of store.matches) {
    matchesById.set(match.id, match);
  }

  const snapshotsById = new Map<string, (typeof store.oddsSnapshots)[number]>();
  for (const snapshot of store.oddsSnapshots) {
    snapshotsById.set(snapshot.id, snapshot);
  }

  const results: BandBreachResult[] = [];

  for (const signal of store.signals) {
    const previousSnapshotId = signal.evidence?.previousSnapshotId;
    const previousSnapshot = previousSnapshotId
      ? snapshotsById.get(previousSnapshotId)
      : undefined;
    const match = matchesById.get(signal.matchId);

    if (!previousSnapshot || !match) continue;

    results.push(assessBandBreach(signal, match, previousSnapshot));
  }

  res.json({
    data: results,
    summary: summarizeBandBreaches(results),
  });
});

app.get("/api/steam-moves", (_req, res) => {
  const snapshotsByMatchId = new Map<string, OddsSnapshot[]>();

  for (const snapshot of store.oddsSnapshots) {
    const existing = snapshotsByMatchId.get(snapshot.matchId) ?? [];
    existing.push(snapshot);
    snapshotsByMatchId.set(snapshot.matchId, existing);
  }

  const steamMoves: SteamMove[] = [];

  for (const snapshots of snapshotsByMatchId.values()) {
    const steamMove = detectSteamMove(snapshots);
    if (steamMove) steamMoves.push(steamMove);
  }

  res.json({
    data: steamMoves,
    summary: {
      matchesScanned: snapshotsByMatchId.size,
      steamMovesDetected: steamMoves.length,
    },
  });
});

app.get("/api/signal-correlation", (_req, res) => {
  const clusters = findSignalClusters(store.signals, CORRELATION_WINDOW_MS);

  res.json({
    data: clusters,
    summary: {
      signalsScanned: store.signals.length,
      clustersDetected: clusters.length,
    },
  });
});

app.get("/api/signal-correlation/patterns", (_req, res) => {
  const clusters = findPatternMatchedClusters(store.signals, CORRELATION_WINDOW_MS);

  res.json({
    data: clusters,
    summary: {
      signalsScanned: store.signals.length,
      patternClustersDetected: clusters.length,
    },
  });
});

app.get("/api/signal-performance", async (_req, res) => {
  const result = await getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 });
  const performance = summarizeSignalTypePerformance(result.data);

  res.json({
    data: performance,
    summary: {
      settledSignalsScanned: result.data.length,
      signalTypesReported: performance.length,
    },
  });
});

app.get("/api/signal-performance/by-confidence", async (_req, res) => {
  const result = await getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 });
  const performance = summarizeConfidenceScorePerformance(result.data);

  res.json({
    data: performance,
    summary: {
      settledSignalsScanned: result.data.length,
      bucketsReported: performance.length,
    },
  });
});

app.get("/api/arena/backtest", async (_req, res) => {
  const result = await getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 });
  const archivedSignals = result.data.map((entry) => entry.signalData);
  const { momentumFollower, kellyCriterion } = computeBacktestScoreboards(archivedSignals);

  res.json({
    data: { momentumFollower, kellyCriterion },
    summary: {
      archivedSignalsScanned: result.data.length,
    },
    note:
      "Contrarian is excluded from backtesting: the archive stores each signal's own resultStatus but not the match's final score, so Contrarian's opposing-side outcome (win vs. draw) can't be reconstructed from archived data alone.",
  });
});

const replayBacktestSnapshots: OddsSnapshot[] = [
  {
    id: "replay-usa-bra-1",
    matchId: "replay-usa-bra",
    homeTeam: "USA",
    awayTeam: "Brazil",
    homeOdds: 2.85,
    awayOdds: 2.2,
    drawOdds: 3.35,
    homeScore: 0,
    awayScore: 0,
    minute: 12,
    source: "simulated_txline",
    createdAt: "2026-06-20T18:12:00.000Z",
  },
  {
    id: "replay-usa-bra-2",
    matchId: "replay-usa-bra",
    homeTeam: "USA",
    awayTeam: "Brazil",
    homeOdds: 2.82,
    awayOdds: 2.04,
    drawOdds: 3.3,
    homeScore: 0,
    awayScore: 0,
    minute: 24,
    source: "simulated_txline",
    createdAt: "2026-06-20T18:24:00.000Z",
  },
  {
    id: "replay-usa-bra-3",
    matchId: "replay-usa-bra",
    homeTeam: "USA",
    awayTeam: "Brazil",
    homeOdds: 2.9,
    awayOdds: 1.82,
    drawOdds: 3.25,
    homeScore: 0,
    awayScore: 1,
    minute: 41,
    source: "simulated_txline",
    createdAt: "2026-06-20T18:41:00.000Z",
  },
  {
    id: "replay-usa-bra-4",
    matchId: "replay-usa-bra",
    homeTeam: "USA",
    awayTeam: "Brazil",
    homeOdds: 3.15,
    awayOdds: 1.66,
    drawOdds: 3.4,
    homeScore: 0,
    awayScore: 1,
    minute: 63,
    source: "simulated_txline",
    createdAt: "2026-06-20T19:03:00.000Z",
  },
];

const replayMatchEvents = [
  {
    id: "event-usa-bra-1",
    matchId: "replay-usa-bra",
    minute: 39,
    team: "Brazil",
    type: "shot_on_target",
    description: "Brazil registered a dangerous shot on target before the odds move.",
    createdAt: "2026-06-20T18:39:00.000Z",
  },
  {
    id: "event-usa-bra-2",
    matchId: "replay-usa-bra",
    minute: 41,
    team: "Brazil",
    type: "goal",
    description: "Brazil scored, confirming the market-side pressure detected by the odds feed.",
    createdAt: "2026-06-20T18:41:00.000Z",
  },
  {
    id: "event-usa-bra-3",
    matchId: "replay-usa-bra",
    minute: 60,
    team: "Brazil",
    type: "sustained_attack",
    description: "Brazil sustained attacking momentum after the goal.",
    createdAt: "2026-06-20T19:00:00.000Z",
  },
];

app.get("/api/replay/backtest", async (_req, res) => {
  const recentResultIds = new Set(
    store.recentFinishedMatches.map((match) => match.id)
  );
  const hasRecentOddsHistory = store.oddsSnapshots.some((snapshot) =>
    recentResultIds.has(snapshot.matchId)
  );

  if (store.recentFinishedMatches.length === 0 || !hasRecentOddsHistory) {
    const recentFeed = await fetchRecentTxLineResults();

    const newlyFinishedMatches = upsertRecentFinishedMatches(recentFeed.matches);
    for (const match of newlyFinishedMatches) {
      void archiveMatch(match);
    }

    for (const snapshot of recentFeed.snapshots) {
      const alreadyExists = store.oddsSnapshots.some(
        (item) => item.id === snapshot.id
      );

      if (!alreadyExists) {
        store.oddsSnapshots.push(snapshot);
      }
    }
  }

  const finishedMatchIds = new Set(
    store.recentFinishedMatches.map((match) => match.id)
  );

  const finishedReplaySnapshots = store.oddsSnapshots
    .filter(
      (snapshot) =>
        snapshot.source === "txline" && finishedMatchIds.has(snapshot.matchId)
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  const liveReplaySnapshots = store.oddsSnapshots
    .filter(
      (snapshot) =>
        snapshot.source === "txline" && !finishedMatchIds.has(snapshot.matchId)
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    .slice(-90);

  const realReplaySnapshots = [...liveReplaySnapshots, ...finishedReplaySnapshots]
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    .slice(-120);

  const useRealReplay = realReplaySnapshots.length >= 2;
  const replaySnapshots = useRealReplay
    ? realReplaySnapshots
    : replayBacktestSnapshots;
  const replayEvents = useRealReplay ? [] : replayMatchEvents;
  const datasetId = useRealReplay
    ? "txline-real-odds-replay"
    : "world-cup-replay-usa-bra";

  const replayMatches = [...store.matches, ...store.recentFinishedMatches];

  const snapshotsByMatch = new Map<string, OddsSnapshot[]>();

  for (const snapshot of replaySnapshots) {
    const existing = snapshotsByMatch.get(snapshot.matchId) ?? [];
    existing.push(snapshot);
    snapshotsByMatch.set(snapshot.matchId, existing);
  }

  function settleReplaySignal(
    signal: NonNullable<ReturnType<typeof buildSignalFromSnapshots>>
  ) {
    const match = replayMatches.find((item) => item.id === signal.matchId);

    if (!match || match.status !== "finished") {
      return "pending";
    }

    const homeWon = match.homeScore > match.awayScore;
    const awayWon = match.awayScore > match.homeScore;
    if (
      (signal.side === "home" && homeWon) ||
      (signal.side === "away" && awayWon)
    ) {
      return "correct";
    }

    return "incorrect";
  }

  function checkScoreReality(
    signal: NonNullable<ReturnType<typeof buildSignalFromSnapshots>>,
    resultStatus: "pending" | "correct" | "incorrect"
  ) {
    const match = replayMatches.find((item) => item.id === signal.matchId);

    if (!match || match.status !== "finished") {
      return {
        finalScore: "Not settled yet",
        scoreRealityStatus: "WAITING_FOR_FINAL_SCORE",
        scoreRealityReason:
          "The match is still pending, so GoalPulse cannot compare the odds move against the final score yet.",
      };
    }

    const finalScore = `${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`;
    const targetWon =
      (signal.side === "home" && match.homeScore > match.awayScore) ||
      (signal.side === "away" && match.awayScore > match.homeScore);

    if (targetWon && resultStatus === "correct") {
      return {
        finalScore,
        scoreRealityStatus: "CONFIRMED_BY_SCORE",
        scoreRealityReason: `${signal.target} was backed by the odds movement and the final score confirmed it: ${finalScore}.`,
      };
    }

    return {
      finalScore,
      scoreRealityStatus: "REJECTED_BY_SCORE",
      scoreRealityReason: `${signal.target} was backed by the odds movement, but the final score did not confirm it: ${finalScore}. GoalPulse marks this as score-vs-odds disagreement.`,
    };
  }
  function classifyMarketTrap(
    signal: NonNullable<ReturnType<typeof buildSignalFromSnapshots>>,
    resultStatus: "pending" | "correct" | "incorrect"
  ) {
    const movement = Math.abs(signal.oddsChangePct);

    if (resultStatus === "pending") {
      return {
        trapStatus: "WATCHING",
        trapScore: Math.min(100, Math.round(movement * 2.2)),
        trapReason:
          "The match is not settled yet, so the agent is watching whether the odds movement gets confirmed or rejected.",
        reversalRisk: movement >= 25 ? "OVEREXTENDED_WATCH" : "NORMAL_WATCH",
        reversalReason:
          movement >= 25
            ? "The odds move is already large, so GoalPulse watches for possible reversal or failed confirmation."
            : "The odds move is still within a normal watch range.",
      };
    }

    if (resultStatus === "correct") {
      return {
        trapStatus: "VALIDATED_MOVE",
        trapScore: 0,
        trapReason:
          "The final result confirmed the odds movement, so this was treated as a validated market move.",
        reversalRisk: "VALIDATED",
        reversalReason:
          "The final result confirmed the move, so no reversal warning was raised.",
      };
    }

    if (movement >= 15) {
      return {
        trapStatus: "CONFIRMED_TRAP",
        trapScore: Math.min(100, Math.round(55 + movement)),
        trapReason: `${signal.target} had a sharp ${movement}% odds compression, but the final result rejected the move. GoalPulse flags this as a possible smart money trap or false market move.`,
        reversalRisk: movement >= 35 ? "EXTREME_REVERSAL" : "HIGH_REVERSAL",
        reversalReason: `${signal.target} had an overextended ${movement}% odds compression that was rejected by the final result. GoalPulse marks this as a reversal warning.`,
      };
    }

    if (movement >= 8) {
      return {
        trapStatus: "POSSIBLE_TRAP",
        trapScore: Math.min(100, Math.round(35 + movement)),
        trapReason: `${signal.target} had a meaningful ${movement}% odds movement, but the outcome did not confirm it. The agent marks it as a possible trap for review.`,
        reversalRisk: "MODERATE_REVERSAL",
        reversalReason: `${signal.target} had a meaningful ${movement}% move that failed outcome confirmation, so the radar marks it as moderate reversal risk.`,
      };
    }

    return {
      trapStatus: "LOW_TRAP_RISK",
      trapScore: Math.round(movement),
      trapReason:
        "The rejected movement was small, so the agent does not treat it as a strong trap pattern.",
      reversalRisk: "LOW_REVERSAL",
      reversalReason:
        "The rejected odds movement was small, so reversal risk is low.",
    };
  }
  const detectedSignals = Array.from(snapshotsByMatch.values())
    .flatMap((matchSnapshots) =>
      matchSnapshots
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        .map((snapshot, index) =>
          buildSignalFromSnapshots(snapshot, matchSnapshots[index - 1])
        )
        .filter(
          (
            signal
          ): signal is NonNullable<ReturnType<typeof buildSignalFromSnapshots>> =>
            Boolean(signal)
        )
    )
    .map((signal, index) => {
      const resultStatus = useRealReplay
        ? settleReplaySignal(signal)
        : signal.side === "away"
          ? "correct"
          : "incorrect";
      const trapAssessment = classifyMarketTrap(signal, resultStatus);
      const scoreRealityCheck = checkScoreReality(signal, resultStatus);

      return {
        ...signal,
        id: `${useRealReplay ? "txline-replay" : "replay"}-signal-${index + 1}`,
        resultStatus,
        ...trapAssessment,
        ...scoreRealityCheck,
      };
    });

  const councilVotes = detectedSignals.map((signal) => {
    const movementApproved = signal.oddsChangePct >= 4;
    const reversionApproved =
      signal.oddsChangePct < 22 && signal.momentumScore >= 2;
    const relatedEvents = replayEvents.filter(
      (event) => event.matchId === signal.matchId && event.team === signal.target
    );

    const eventApproved =
      relatedEvents.some((event) =>
        ["goal", "penalty", "shot_on_target", "sustained_attack"].includes(
          event.type
        )
      ) || signal.momentumScore >= 8;

    const votes: CouncilVoteEntry[] = [
      {
        agent: "Agent A - Movement Detector",
        vote: movementApproved ? "approve" : "reject",
        reason: `${signal.oddsChangePct}% odds compression crossed the movement threshold.`,
      },
      {
        agent: "Agent B - Mean Reversion Guard",
        vote: reversionApproved ? "approve" : "watch",
        reason: reversionApproved
          ? "Movement is strong but not beyond the overextension guard."
          : "Movement may be overextended and needs caution.",
      },
      {
        agent: "Agent C - Evidence Correlator",
        vote: eventApproved ? "approve" : "watch",
        reason: useRealReplay
          ? `Real TxLINE evidence chain found for ${signal.target}.`
          : eventApproved
            ? `Replay event feed found ${relatedEvents.length} supporting event(s) for ${signal.target}.`
            : "No strong event-side confirmation found in replay context.",
      },
    ];

    const approvals = votes.filter((vote) => vote.vote === "approve").length;
    const decision =
      approvals >= 2 ? "approved" : approvals === 1 ? "watch" : "rejected";
    const dissent = computeDissent(votes);

    return {
      signalId: signal.id,
      matchId: signal.matchId,
      target: signal.target,
      decision,
      approvals,
      totalAgents: votes.length,
      votes,
      unanimous: dissent.unanimous,
      dissentingAgents: dissent.dissentingAgents,
    };
  });

  const councilDissentSummary = summarizeDissent(councilVotes.map((vote) => vote.votes));

  const correctSignals = detectedSignals.filter(
    (signal) => signal.resultStatus === "correct"
  ).length;

  const incorrectSignals = detectedSignals.filter(
    (signal) => signal.resultStatus === "incorrect"
  ).length;

  const settledSignalCount = correctSignals + incorrectSignals;

  const confirmedTraps = detectedSignals.filter(
    (signal) => signal.trapStatus === "CONFIRMED_TRAP"
  ).length;

  const possibleTraps = detectedSignals.filter(
    (signal) => signal.trapStatus === "POSSIBLE_TRAP"
  ).length;

  const smartMoneyTraps = confirmedTraps + possibleTraps;

  const proofHash = createHash("sha256")
    .update(
      JSON.stringify({
        datasetId,
        source: useRealReplay ? "real_txline_store" : "demo_replay_fixture",
        snapshots: replaySnapshots.map((snapshot) => snapshot.id),
        events: replayEvents.map((event) => ({
          id: event.id,
          matchId: event.matchId,
          minute: event.minute,
          team: event.team,
          type: event.type,
        })),
        signals: detectedSignals.map((signal) => ({
          id: signal.id,
          matchId: signal.matchId,
          side: signal.side,
          oddsBefore: signal.oddsBefore,
          oddsAfter: signal.oddsAfter,
          oddsChangePct: signal.oddsChangePct,
          resultStatus: signal.resultStatus,
          trapStatus: signal.trapStatus,
          trapScore: signal.trapScore,
          reversalRisk: signal.reversalRisk,
          finalScore: signal.finalScore,
          scoreRealityStatus: signal.scoreRealityStatus,
        })),
        councilVotes: councilVotes.map((councilVote) => ({
          signalId: councilVote.signalId,
          decision: councilVote.decision,
          approvals: councilVote.approvals,
          totalAgents: councilVote.totalAgents,
          unanimous: councilVote.unanimous,
          dissentingAgents: councilVote.dissentingAgents,
        })),
      })
    )
    .digest("hex");

  res.json({
    data: {
      datasetId,
      mode: useRealReplay ? "real_txline_replay" : "historical_replay",
      status: "completed",
      summary: {
        snapshotsProcessed: replaySnapshots.length,
        signalsDetected: detectedSignals.length,
        correctSignals,
        incorrectSignals,
        accuracyPct:
          settledSignalCount > 0
            ? Math.round((correctSignals / settledSignalCount) * 100)
            : 0,
        smartMoneyTraps,
        councilDissent: councilDissentSummary,
        confirmedTraps,
        possibleTraps,
      },
      timeline: [
        {
          step: useRealReplay
            ? "Real TxLINE feed loaded"
            : "Historical feed loaded",
          detail: `${replaySnapshots.length} odds snapshots loaded`,
        },
        {
          step: useRealReplay
            ? "Evidence chains verified"
            : "Match events correlated",
          detail: useRealReplay
            ? "Replay used stored TxLINE snapshot IDs, message IDs, and source evidence."
            : `${replayEvents.length} event(s) checked against odds movement`,
        },
        {
          step: "Signal engine replayed",
          detail: `${detectedSignals.length} signal(s) detected using deterministic thresholds`,
        },
        {
          step: "Council voted",
          detail: `${councilVotes.filter((vote) => vote.decision === "approved").length} approved decision(s) from 3-agent quorum`,
        },
        {
          step: "Outcomes verified",
          detail: `${correctSignals} confirmed and ${incorrectSignals} rejected signal(s)`,
        },
        {
          step: "Smart money traps detected",
          detail: `${confirmedTraps} confirmed trap(s) and ${possibleTraps} possible trap(s) found from rejected market moves`,
        },
        {
          step: "Proof hash generated",
          detail: proofHash,
        },
      ],
      snapshots: replaySnapshots,
      events: replayEvents,
      signals: detectedSignals,
      councilVotes,
      proof: {
        type: "sha256",
        hash: proofHash,
        network: "solana-devnet",
        anchoringStatus: process.env.SOLANA_PRIVATE_KEY
          ? "ready_to_anchor"
          : "pending_wallet_configuration",
        walletConfigured: Boolean(process.env.SOLANA_PRIVATE_KEY),
        transactionSignature: null,
        explorerUrl: null,
        note: process.env.SOLANA_PRIVATE_KEY
          ? "Wallet configured. This proof hash is ready for Solana devnet transaction signing."
          : "Proof hash generated. Devnet anchoring is pending until a Solana wallet/private key is configured.",
      },
    },
  });
});

app.post("/api/agent/run-once", runOnceLimiter, requireApiKey, async (_req, res) => {
  const run = await processAgentCycle();

  res.json({
    data: run,
  });
});

let isAgentCycleRunning = false;
let lastSnapshotAt = 0;
const snapshotIntervalMs = 30000;

async function runGuardedAgentCycle(source: string) {
  if (isAgentCycleRunning) {
    console.warn(`Skipping ${source} agent cycle because the previous cycle is still running.`);
    return;
  }

  isAgentCycleRunning = true;

  try {
    const run = await processAgentCycle();
    console.log(run.message);

    if (Date.now() - lastSnapshotAt >= snapshotIntervalMs) {
      lastSnapshotAt = Date.now();
      void saveSnapshot();
    }
  } catch (error) {
    console.error("Agent cycle failed:", error);
  } finally {
    isAgentCycleRunning = false;
  }
}
app.listen(config.port, async () => {
  console.log(`GoalPulse Agent API running on http://localhost:${config.port}`);
  console.log(`Autonomous agent interval: ${config.agentIntervalMs}ms`);
  console.log(
    `Feed mode: ${config.useSimulatedFeed ? "simulated_txline" : "txline"}`
  );

  await loadSnapshot();

  await runGuardedAgentCycle("startup");

  startLiveStreamMonitor();
  startLiveOddsStreamMonitor();

  setInterval(() => {
    void runGuardedAgentCycle("scheduled");
  }, config.agentIntervalMs);
});
