import { config } from "./config";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { fetchSimulatedTxLineFeed } from "./services/mockTxLine";
import { fetchTxLineFeed } from "./services/txlineClient";
import { sendHighSeverityAlert } from "./services/alerts";
import { archiveMatch, archiveOddsSnapshots, archiveSignal } from "./services/archive";
import {
  evaluatePendingSignalsForFinishedMatches,
  findPreviousSnapshot,
  signalAlreadyExists,
  snapshotAlreadyExists,
  upsertRecentFinishedMatches,
  store,
} from "./store";
import { AgentRun, AgentSignal, OddsSnapshot } from "./types";

export function findPendingSignals(signals: AgentSignal[]): AgentSignal[] {
  return signals.filter((signal) => signal.resultStatus === "pending");
}

/**
 * Takes signal objects already known to have been "pending" at some earlier
 * point (by reference, not id - sidesteps the known duplicate-signal-id
 * behavior from stale-finished-match repolling, since this only ever
 * inspects the exact objects it was given) and returns the ones that have
 * since transitioned away from "pending" via evaluatePendingSignalsForFinishedMatches
 * mutating them in place.
 */
export function findNewlySettledSignals(
  signalsCapturedWhilePending: AgentSignal[]
): AgentSignal[] {
  return signalsCapturedWhilePending.filter(
    (signal) => signal.resultStatus !== "pending"
  );
}

export async function processAgentCycle(): Promise<AgentRun> {
  const startedAt = new Date().toISOString();

  try {
    const feed = config.useSimulatedFeed
      ? fetchSimulatedTxLineFeed()
      : await fetchTxLineFeed();

    store.matches = feed.matches;
    const newlyFinishedMatches = upsertRecentFinishedMatches(feed.matches);
    for (const match of newlyFinishedMatches) {
      void archiveMatch(match);
    }

    let signalsCreated = 0;
    let snapshotsCreated = 0;
    let highSeverityAlertCount = 0;
    const acceptedSnapshots: OddsSnapshot[] = [];
    const alertStaggerMs = 750;

    const orderedSnapshots = [...feed.snapshots].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const snapshot of orderedSnapshots) {
      if (snapshotAlreadyExists(snapshot.id)) {
        store.duplicatesDropped.snapshots += 1;
        continue;
      }

      const previousSnapshot = findPreviousSnapshot(snapshot.matchId);

const isChronologicallyValid = !previousSnapshot || new Date(previousSnapshot.createdAt).getTime() < new Date(snapshot.createdAt).getTime();

      const signal = isChronologicallyValid
        ? buildSignalFromSnapshots(snapshot, previousSnapshot)
        : null;

      store.oddsSnapshots.unshift(snapshot);
      acceptedSnapshots.push(snapshot);
      snapshotsCreated += 1;

      if (signal && !signalAlreadyExists(signal)) {
        store.signals.unshift(signal);
        signalsCreated += 1;
        void archiveSignal(signal, "created");

        if (signal.severity === "HIGH") {
          const delayMs = highSeverityAlertCount * alertStaggerMs;
          highSeverityAlertCount += 1;

          void new Promise<void>((resolve) => setTimeout(resolve, delayMs))
            .then(() => sendHighSeverityAlert(signal))
            .then((status) => {
              signal.discordAlertStatus = status;
            });
        }
      } else if (signal) {
        store.duplicatesDropped.signals += 1;
      }
    }

    if (acceptedSnapshots.length > 0) {
      void archiveOddsSnapshots(acceptedSnapshots);
    }

    const pendingSignalsBeforeEvaluation = findPendingSignals(store.signals);
    const evaluatedSignals = evaluatePendingSignalsForFinishedMatches();

    for (const signal of findNewlySettledSignals(pendingSignalsBeforeEvaluation)) {
      void archiveSignal(signal, "settled");
    }

    store.oddsSnapshots = store.oddsSnapshots.slice(0, 800);
    store.signals = store.signals.slice(0, 100);

    const run: AgentRun = {
      id: `run-${Date.now()}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      matchesProcessed: feed.matches.length,
      snapshotsCreated,
      signalsCreated,
      rawFixtureCount: feed.rawFixtureCount ?? feed.matches.length,
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
      rawFixtureCount: 0,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown agent error",
    };

    store.agentRuns.unshift(run);
    return run;
  }
}

