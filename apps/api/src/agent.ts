import { config } from "./config";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { fetchSimulatedTxLineFeed } from "./services/mockTxLine";
import { fetchTxLineFeed } from "./services/txlineClient";
import { sendHighSeverityAlert } from "./services/alerts";
import {
  evaluatePendingSignalsForFinishedMatches,
  findPreviousSnapshot,
  signalAlreadyExists,
  snapshotAlreadyExists,
  upsertRecentFinishedMatches,
  store,
} from "./store";
import { AgentRun } from "./types";

export async function processAgentCycle(): Promise<AgentRun> {
  const startedAt = new Date().toISOString();

  try {
    const feed = config.useSimulatedFeed
      ? fetchSimulatedTxLineFeed()
      : await fetchTxLineFeed();

    store.matches = feed.matches;
    upsertRecentFinishedMatches(feed.matches);

    let signalsCreated = 0;
    let snapshotsCreated = 0;
    let highSeverityAlertCount = 0;
    const alertStaggerMs = 750;

    const orderedSnapshots = [...feed.snapshots].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const snapshot of orderedSnapshots) {
      if (snapshotAlreadyExists(snapshot.id)) {
        continue;
      }

      const previousSnapshot = findPreviousSnapshot(snapshot.matchId);

const isChronologicallyValid = !previousSnapshot || new Date(previousSnapshot.createdAt).getTime() < new Date(snapshot.createdAt).getTime();

      const signal = isChronologicallyValid
        ? buildSignalFromSnapshots(snapshot, previousSnapshot)
        : null;

      store.oddsSnapshots.unshift(snapshot);
      snapshotsCreated += 1;

      if (signal && !signalAlreadyExists(signal)) {
        store.signals.unshift(signal);
        signalsCreated += 1;

        if (signal.severity === "HIGH") {
          const delayMs = highSeverityAlertCount * alertStaggerMs;
          highSeverityAlertCount += 1;

          void new Promise<void>((resolve) => setTimeout(resolve, delayMs))
            .then(() => sendHighSeverityAlert(signal))
            .then((status) => {
              signal.discordAlertStatus = status;
            });
        }
      }
    }

    const evaluatedSignals = evaluatePendingSignalsForFinishedMatches();

    store.oddsSnapshots = store.oddsSnapshots.slice(0, 800);
    store.signals = store.signals.slice(0, 100);

    const run: AgentRun = {
      id: `run-${Date.now()}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      matchesProcessed: feed.matches.length,
      snapshotsCreated,
      signalsCreated,
      status: "success",
      message: `Processed ${feed.matches.length} matches, stored ${snapshotsCreated} new snapshot(s), generated ${signalsCreated} signal(s), and evaluated ${evaluatedSignals} pending signal(s).`,
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

