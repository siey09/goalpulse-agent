import cors from "cors";
import express from "express";
import { processAgentCycle } from "./agent";
import { config } from "./config";
import { getStats, store } from "./store";

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
