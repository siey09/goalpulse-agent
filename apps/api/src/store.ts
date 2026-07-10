import { AgentRun, AgentSignal, Match, OddsSnapshot } from "./types";

export const store: {
  matches: Match[];
  recentFinishedMatches: Match[];
  oddsSnapshots: OddsSnapshot[];
  signals: AgentSignal[];
  agentRuns: AgentRun[];
  duplicatesDropped: { snapshots: number; signals: number };
} = {
  matches: [],
  recentFinishedMatches: [],
  oddsSnapshots: [],
  signals: [],
  agentRuns: [],
  duplicatesDropped: { snapshots: 0, signals: 0 },
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

/**
 * Appends newly-fetched snapshots (deduped by id) into the shared store and
 * re-sorts the whole array descending by createdAt (newest first). Every
 * reader of store.oddsSnapshots (agent.ts's unshift ordering, the
 * .slice(0,100).reverse() pattern in /api/odds-stream, /api/odds-history,
 * /api/live/replay-stream) assumes this newest-first order — sorting
 * ascending here instead previously corrupted that shared order and produced
 * out-of-sequence timestamps on the odds movement chart.
 */
export function mergeOddsSnapshots(newSnapshots: OddsSnapshot[]): void {
  for (const snapshot of newSnapshots) {
    if (!snapshotAlreadyExists(snapshot.id)) {
      store.oddsSnapshots.push(snapshot);
    }
  }

  store.oddsSnapshots.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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


export function upsertRecentFinishedMatches(matches: Match[]): Match[] {
  const finishedMatches = matches.filter((match) => match.status === "finished");

  const previouslyFinishedIds = new Set(
    store.recentFinishedMatches.map((match) => match.id)
  );
  const newlyFinishedMatches = finishedMatches.filter(
    (match) => !previouslyFinishedIds.has(match.id)
  );

  for (const match of finishedMatches) {
    const existingIndex = store.recentFinishedMatches.findIndex(
      (item) => item.id === match.id
    );

    if (existingIndex >= 0) {
      store.recentFinishedMatches[existingIndex] = match;
    } else {
      store.recentFinishedMatches.unshift(match);
    }
  }

  store.recentFinishedMatches = store.recentFinishedMatches
    .sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    )
    .slice(0, 20);

  return newlyFinishedMatches;
}
export function evaluatePendingSignalsForFinishedMatches() {
  let evaluatedCount = 0;

  for (const signal of store.signals) {
    if (signal.resultStatus !== "pending") continue;

    const match =
      store.matches.find((item) => item.id === signal.matchId) ??
      store.recentFinishedMatches.find((item) => item.id === signal.matchId) ??
      // Totals signals use a distinct matchId ("<fixtureId>-totals-<line>") to
      // keep their odds history isolated from the 1X2 market (see
      // normalizeTotalsSnapshot). Settlement still needs the real match's
      // final score, so fall back to the base fixture id before the suffix.
      store.matches.find((item) => signal.matchId.startsWith(`${item.id}-totals-`)) ??
      store.recentFinishedMatches.find((item) =>
        signal.matchId.startsWith(`${item.id}-totals-`)
      );

    if (!match || match.status !== "finished") continue;

    const totalsMatch = signal.target.match(/^(Over|Under) ([\d.]+)$/);

    let signalWon: boolean;

    if (totalsMatch) {
      const [, direction, lineStr] = totalsMatch;
      const line = Number(lineStr);
      const totalGoals = match.homeScore + match.awayScore;
      signalWon =
        direction === "Over" ? totalGoals > line : totalGoals < line;
    } else {
      const homeWon = match.homeScore > match.awayScore;
      const awayWon = match.awayScore > match.homeScore;
      signalWon =
        (signal.side === "home" && homeWon) || (signal.side === "away" && awayWon);
    }

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

/**
 * Simulates a flat 1-unit stake placed on every signal at the decimal odds
 * available at the moment the signal fired (`oddsAfter`), settled against
 * the real, already-verified match outcome. This turns "accuracy %" into an
 * actual trading performance metric: a strategy can be more than 50%
 * accurate and still lose money if winners pay short odds and losers cost
 * a full unit, or the reverse. Pending (unsettled) signals are reported
 * separately as open exposure, not counted in realized P&L.
 */
export function getPnlSummary() {
  const closedSignals = store.signals.filter(
    (s) => s.resultStatus === "correct" || s.resultStatus === "incorrect"
  );
  const pendingSignals = store.signals.filter((s) => s.resultStatus === "pending");

  const unitStake = 1;

  const settle = (signal: (typeof store.signals)[number]) => {
    if (signal.resultStatus === "correct") {
      const price = signal.oddsAfter && signal.oddsAfter > 1 ? signal.oddsAfter : 1;
      return unitStake * (price - 1);
    }

    return -unitStake;
  };

  const netUnits = closedSignals.reduce((sum, signal) => sum + settle(signal), 0);
  const totalStaked = closedSignals.length * unitStake;
  const roiPercent =
    totalStaked === 0 ? 0 : Number(((netUnits / totalStaked) * 100).toFixed(1));

  const bySeverity = (["HIGH", "MEDIUM", "LOW"] as const).map((severity) => {
    const tierSignals = closedSignals.filter((s) => s.severity === severity);
    const tierNet = tierSignals.reduce((sum, signal) => sum + settle(signal), 0);
    const tierStaked = tierSignals.length * unitStake;

    return {
      severity,
      bets: tierSignals.length,
      netUnits: Number(tierNet.toFixed(2)),
      roiPercent:
        tierStaked === 0 ? 0 : Number(((tierNet / tierStaked) * 100).toFixed(1)),
    };
  });

  return {
    unitStake,
    settledBets: closedSignals.length,
    totalStaked: Number(totalStaked.toFixed(2)),
    netUnits: Number(netUnits.toFixed(2)),
    roiPercent,
    openPositions: pendingSignals.length,
    openExposure: Number((pendingSignals.length * unitStake).toFixed(2)),
    bySeverity,
    note: "Simulated flat 1-unit stakes at the odds available when each signal fired, settled against real match outcomes. Analytics only, not a trading recommendation.",
  };
}


