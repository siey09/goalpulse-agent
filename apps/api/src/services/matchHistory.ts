import type { Match, OddsSnapshot } from "../types";
import { store } from "../store";
import { getArchivedOddsSnapshots } from "./archive";
import { enqueueOddsSnapshotsForArchive } from "./oddsArchiveOutbox";
import { fetchTxLineOddsHistoryForMatch } from "./txlineClient";

export type MatchHistorySource = "hot" | "archive" | "txline_recovery" | "unavailable";

export interface MatchHistoryResult {
  history: OddsSnapshot[];
  source: MatchHistorySource;
}

export interface MatchHistoryDependencies {
  getArchivedOddsSnapshots(matchId: string, limit?: number): Promise<OddsSnapshot[]>;
  fetchTxLineOddsHistoryForMatch(match: Match): Promise<OddsSnapshot[]>;
  archiveOddsSnapshots(snapshots: OddsSnapshot[]): Promise<void>;
}

const defaultDependencies: MatchHistoryDependencies = {
  getArchivedOddsSnapshots,
  fetchTxLineOddsHistoryForMatch,
  archiveOddsSnapshots: async (snapshots) => {
    await enqueueOddsSnapshotsForArchive(snapshots);
  },
};

const inFlightRecoveries = new Map<string, Promise<MatchHistoryResult>>();
const recoveredHistoryCache = new Map<string, MatchHistoryResult>();
const MAX_RECOVERED_MATCHES = 200;

function cacheRecoveredHistory(matchId: string, result: MatchHistoryResult): void {
  const cappedResult = { ...result, history: result.history.slice(-100) };
  recoveredHistoryCache.delete(matchId);
  recoveredHistoryCache.set(matchId, cappedResult);

  while (recoveredHistoryCache.size > MAX_RECOVERED_MATCHES) {
    const oldestMatchId = recoveredHistoryCache.keys().next().value as string | undefined;
    if (!oldestMatchId) break;
    recoveredHistoryCache.delete(oldestMatchId);
  }
}

function cachedRecoveredHistory(matchId: string): MatchHistoryResult | undefined {
  const cached = recoveredHistoryCache.get(matchId);
  if (!cached) return undefined;
  recoveredHistoryCache.delete(matchId);
  recoveredHistoryCache.set(matchId, cached);
  return cached;
}

function chronological(snapshots: OddsSnapshot[]): OddsSnapshot[] {
  return [...snapshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function hotHistory(matchId: string): OddsSnapshot[] {
  return chronological(
    store.oddsSnapshots.filter((snapshot) => snapshot.matchId === matchId).slice(0, 100)
  );
}

function findMatch(matchId: string): Match | undefined {
  return (
    store.matches.find((match) => match.id === matchId) ??
    store.recentFinishedMatches.find((match) => match.id === matchId)
  );
}

async function recoverHistory(
  matchId: string,
  dependencies: MatchHistoryDependencies
): Promise<MatchHistoryResult> {
  let archived: OddsSnapshot[] = [];
  try {
    archived = await dependencies.getArchivedOddsSnapshots(matchId, 100);
  } catch (error) {
    console.error("[history] Failed to hydrate archived odds snapshots:", error);
  }

  if (archived.length > 0) {
    const result: MatchHistoryResult = {
      history: chronological(archived),
      source: "archive",
    };
    cacheRecoveredHistory(matchId, result);
    return result;
  }

  const match = findMatch(matchId);
  if (!match || match.status !== "finished") {
    return { history: [], source: "unavailable" };
  }

  let recovered: OddsSnapshot[] = [];
  try {
    recovered = await dependencies.fetchTxLineOddsHistoryForMatch(match);
  } catch (error) {
    console.error(`[history] Failed to recover TxLINE history for fixture ${matchId}:`, error);
  }

  if (recovered.length === 0) {
    return { history: [], source: "unavailable" };
  }

  try {
    await dependencies.archiveOddsSnapshots(recovered);
  } catch (error) {
    console.error(`[history] Failed to archive recovered history for fixture ${matchId}:`, error);
  }

  const result: MatchHistoryResult = {
    history: chronological(recovered),
    source: "txline_recovery",
  };
  cacheRecoveredHistory(matchId, result);
  return result;
}

export async function ensureMatchOddsHistory(
  matchId: string,
  dependencies: MatchHistoryDependencies = defaultDependencies
): Promise<MatchHistoryResult> {
  const hot = hotHistory(matchId);
  if (hot.length > 0) {
    return { history: hot, source: "hot" };
  }

  const cached = cachedRecoveredHistory(matchId);
  if (cached) {
    return cached;
  }

  const existingRecovery = inFlightRecoveries.get(matchId);
  if (existingRecovery) {
    return existingRecovery;
  }

  const recovery = recoverHistory(matchId, dependencies);
  inFlightRecoveries.set(matchId, recovery);

  try {
    return await recovery;
  } finally {
    if (inFlightRecoveries.get(matchId) === recovery) {
      inFlightRecoveries.delete(matchId);
    }
  }
}

export function resetMatchHistoryCacheForTests(): void {
  recoveredHistoryCache.clear();
  inFlightRecoveries.clear();
}
