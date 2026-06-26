import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { processAgentCycle } from "./agent";
import { getStats, store } from "./store";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);
const AGENT_INTERVAL_MS = Number(process.env.AGENT_INTERVAL_MS ?? 60000);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GoalPulse Agent API",
    status: "running",
    agentIntervalMs: AGENT_INTERVAL_MS,
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

app.post("/api/agent/run-once", (_req, res) => {
  const run = processAgentCycle();

  res.json({
    data: run,
  });
});

app.listen(PORT, () => {
  console.log(`GoalPulse Agent API running on http://localhost:${PORT}`);
  console.log(`Autonomous agent interval: ${AGENT_INTERVAL_MS}ms`);

  const firstRun = processAgentCycle();
  console.log(firstRun.message);

  setInterval(() => {
    const run = processAgentCycle();
    console.log(run.message);
  }, AGENT_INTERVAL_MS);
});
