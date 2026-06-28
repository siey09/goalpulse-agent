import { AgentRun, AgentSignal, Match, OddsSnapshot } from "./types";

export const store: {
  matches: Match[];
  oddsSnapshots: OddsSnapshot[];
  signals: AgentSignal[];
  agentRuns: AgentRun[];
} = {
  matches: [],
  oddsSnapshots: [],
  signals: [],
  agentRuns: [],
};

export function snapshotAlreadyExists(snapshotId: string): boolean {
  return store.oddsSnapshots.some((snapshot) => snapshot.id === snapshotId);
}

export function findPreviousSnapshot(matchId: string): OddsSnapshot | undefined {
  const snapshots = store.oddsSnapshots
    .filter((snapshot) => snapshot.matchId === matchId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  return snapshots[0];
}

export function signalAlreadyExists(signal: AgentSignal): boolean {
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;

  return store.signals.some((existing) => {
    const createdTime = new Date(existing.createdAt).getTime();

    return (
      existing.matchId === signal.matchId &&
      existing.side === signal.side &&
      existing.signalType === signal.signalType &&
      existing.oddsBefore === signal.oddsBefore &&
      existing.oddsAfter === signal.oddsAfter &&
      createdTime >= sixHoursAgo
    );
  });
}

export function evaluatePendingSignalsForFinishedMatches() {
  let evaluatedCount = 0;

  for (const signal of store.signals) {
    if (signal.resultStatus !== "pending") continue;

    const match = store.matches.find((item) => item.id === signal.matchId);

    if (!match || match.status !== "finished") continue;

    const homeWon = match.homeScore > match.awayScore;
    const awayWon = match.awayScore > match.homeScore;

    const signalWon =
      (signal.side === "home" && homeWon) || (signal.side === "away" && awayWon);

    signal.resultStatus = signalWon ? "correct" : "incorrect";
    evaluatedCount += 1;
  }

  return evaluatedCount;
}

export function getStats() {
  const totalSignals = store.signals.length;
  const highSeverity = store.signals.filter((s) => s.severity === "HIGH").length;
  const pending = store.signals.filter((s) => s.resultStatus === "pending").length;
  const correct = store.signals.filter((s) => s.resultStatus === "correct").length;
  const incorrect = store.signals.filter((s) => s.resultStatus === "incorrect").length;
  const closed = correct + incorrect;

  return {
    txlineUpdates: store.oddsSnapshots.length,
    signalsGenerated: totalSignals,
    highSeverity,
    pendingSignals: pending,
    correctSignals: correct,
    incorrectSignals: incorrect,
    closedSignals: closed,
    strategyAccuracy:
      closed === 0 ? 0 : Number(((correct / closed) * 100).toFixed(1)),
    lastAgentRun: store.agentRuns[0] ?? null,
  };
}
