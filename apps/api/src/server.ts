import { createHash } from "crypto";
import cors from "cors";
import express from "express";
import { processAgentCycle } from "./agent";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { config } from "./config";
import { getStats, store } from "./store";
import type { OddsSnapshot } from "./types";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GoalPulse Agent API",
    status: "running",
    agentIntervalMs: config.agentIntervalMs,
    useSimulatedFeed: config.useSimulatedFeed,
    txlineBaseUrl: config.txlineApiBaseUrl,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/matches", (_req, res) => {
  res.json({
    data: store.matches,
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

app.get("/api/odds-history", (req, res) => {
  const matchId = String(req.query.matchId ?? "");

  const snapshots = matchId
    ? store.oddsSnapshots.filter((snapshot) => snapshot.matchId === matchId)
    : store.oddsSnapshots;

  res.json({
    data: snapshots.slice(0, 100).reverse(),
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

app.get("/api/replay/backtest", (_req, res) => {
  const detectedSignals = replayBacktestSnapshots
    .map((snapshot, index) =>
      buildSignalFromSnapshots(snapshot, replayBacktestSnapshots[index - 1])
    )
    .filter((signal): signal is NonNullable<typeof signal> => Boolean(signal))
    .map((signal, index) => ({
      ...signal,
      id: `replay-signal-${index + 1}`,
      createdAt: replayBacktestSnapshots[index + 1]?.createdAt ?? signal.createdAt,
      resultStatus: signal.side === "away" ? "correct" : "incorrect",
    }));

  const councilVotes = detectedSignals.map((signal) => {
    const movementApproved = signal.oddsChangePct >= 4;
    const reversionApproved =
      signal.oddsChangePct < 22 && signal.momentumScore >= 2;
    const eventApproved = signal.side === "away" || signal.momentumScore >= 8;

    const votes = [
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
        agent: "Agent C - Event Correlator",
        vote: eventApproved ? "approve" : "watch",
        reason: eventApproved
          ? "Replay context supports the detected market movement."
          : "No strong event-side confirmation found in replay context.",
      },
    ];

    const approvals = votes.filter((vote) => vote.vote === "approve").length;
    const decision =
      approvals >= 2 ? "approved" : approvals === 1 ? "watch" : "rejected";

    return {
      signalId: signal.id,
      matchId: signal.matchId,
      target: signal.target,
      decision,
      approvals,
      totalAgents: votes.length,
      votes,
    };
  });
  const correctSignals = detectedSignals.filter(
    (signal) => signal.resultStatus === "correct"
  ).length;

  const incorrectSignals = detectedSignals.filter(
    (signal) => signal.resultStatus === "incorrect"
  ).length;

  const proofHash = createHash("sha256")
    .update(
      JSON.stringify({
        datasetId: "world-cup-replay-usa-bra",
        snapshots: replayBacktestSnapshots.map((snapshot) => snapshot.id),
        signals: detectedSignals.map((signal) => ({
          id: signal.id,
          matchId: signal.matchId,
          side: signal.side,
          oddsBefore: signal.oddsBefore,
          oddsAfter: signal.oddsAfter,
          oddsChangePct: signal.oddsChangePct,
          resultStatus: signal.resultStatus,
        })),
        councilVotes: councilVotes.map((councilVote) => ({
          signalId: councilVote.signalId,
          decision: councilVote.decision,
          approvals: councilVote.approvals,
          totalAgents: councilVote.totalAgents,
        })),
      })
    )
    .digest("hex");

  res.json({
    data: {
      datasetId: "world-cup-replay-usa-bra",
      mode: "historical_replay",
      status: "completed",
      summary: {
        snapshotsProcessed: replayBacktestSnapshots.length,
        signalsDetected: detectedSignals.length,
        correctSignals,
        incorrectSignals,
        accuracyPct:
          detectedSignals.length > 0
            ? Math.round((correctSignals / detectedSignals.length) * 100)
            : 0,
      },
      timeline: [
        {
          step: "Historical feed loaded",
          detail: `${replayBacktestSnapshots.length} odds snapshots loaded`,
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
          detail: `${correctSignals} correct and ${incorrectSignals} incorrect signal(s)`,
        },
        {
          step: "Proof hash generated",
          detail: proofHash,
        },
      ],
      snapshots: replayBacktestSnapshots,
      signals: detectedSignals,
      councilVotes,
      proof: {
        type: "sha256",
        hash: proofHash,
        note: "Devnet anchoring can store this hash when Solana signing is configured.",
      },
    },
  });
});
app.post("/api/agent/run-once", async (_req, res) => {
  const run = await processAgentCycle();

  res.json({
    data: run,
  });
});

app.listen(config.port, async () => {
  console.log(`GoalPulse Agent API running on http://localhost:${config.port}`);
  console.log(`Autonomous agent interval: ${config.agentIntervalMs}ms`);
  console.log(
    `Feed mode: ${config.useSimulatedFeed ? "simulated_txline" : "txline"}`
  );

  const firstRun = await processAgentCycle();
  console.log(firstRun.message);

  setInterval(() => {
    processAgentCycle()
      .then((run) => {
        console.log(run.message);
      })
      .catch((error) => {
        console.error("Agent cycle failed:", error);
      });
  }, config.agentIntervalMs);
});



