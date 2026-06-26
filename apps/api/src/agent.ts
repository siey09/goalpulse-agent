import { config } from "./config";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { fetchSimulatedTxLineFeed } from "./services/mockTxLine";
import { fetchTxLineFeed } from "./services/txlineClient";
import { findPreviousSnapshot, signalAlreadyExists, store } from "./store";
import { AgentRun } from "./types";

export async function processAgentCycle(): Promise<AgentRun> {
  const startedAt = new Date().toISOString();

  try {
    const feed = config.useSimulatedFeed
      ? fetchSimulatedTxLineFeed()
      : await fetchTxLineFeed();

    store.matches = feed.matches;

    let signalsCreated = 0;

    for (const snapshot of feed.snapshots) {
      const previousSnapshot = findPreviousSnapshot(snapshot.matchId);
      const signal = buildSignalFromSnapshots(snapshot, previousSnapshot);

      store.oddsSnapshots.unshift(snapshot);

      if (signal && !signalAlreadyExists(signal)) {
        store.signals.unshift(signal);
        signalsCreated += 1;
      }
    }

    store.oddsSnapshots = store.oddsSnapshots.slice(0, 500);
    store.signals = store.signals.slice(0, 100);

    const run: AgentRun = {
      id: `run-${Date.now()}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      matchesProcessed: feed.matches.length,
      snapshotsCreated: feed.snapshots.length,
      signalsCreated,
      status: "success",
      message: `Processed ${feed.matches.length} matches and generated ${signalsCreated} signal(s).`,
    };

    store.agentRuns.unshift(run);
    store.agentRuns = store.agentRuns.slice(0, 50);

    return run;
  } catch (error) {
    const run: AgentRun = {
      id: `run-${Date.now()}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      matchesProcessed: 0,
      snapshotsCreated: 0,
      signalsCreated: 0,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown agent error",
    };

    store.agentRuns.unshift(run);
    return run;
  }
}
