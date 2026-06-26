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
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;

  return store.signals.some((existing) => {
    const createdTime = new Date(existing.createdAt).getTime();

    return (
      existing.matchId === signal.matchId &&
      existing.side === signal.side &&
      existing.severity === signal.severity &&
      createdTime >= twoMinutesAgo
    );
  });
}

export function getStats() {
  const totalSignals = store.signals.length;
  const highSeverity = store.signals.filter((s) => s.severity === "HIGH").length;
  const pending = store.signals.filter((s) => s.resultStatus === "pending").length;
  const correct = store.signals.filter((s) => s.resultStatus === "correct").length;
  const closed = store.signals.filter((s) => s.resultStatus !== "pending").length;

  return {
    txlineUpdates: store.oddsSnapshots.length,
    signalsGenerated: totalSignals,
    highSeverity,
    pendingSignals: pending,
    strategyAccuracy:
      closed === 0 ? 0 : Number(((correct / closed) * 100).toFixed(1)),
    lastAgentRun: store.agentRuns[0] ?? null,
  };
}
