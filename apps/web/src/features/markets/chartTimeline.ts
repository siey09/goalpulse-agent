import { formatTime } from "../../lib/formatters";

interface SnapshotPrices {
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
}

export interface OddsSnapshot extends SnapshotPrices {
  id?: string;
  matchId?: string;
  timestamp?: string;
  createdAt?: string;
  market?: SnapshotPrices;
}

export interface MarketTimelinePoint {
  id: string;
  name: string;
  timelineX: number;
  hasRealTimestamp: boolean;
  rawTimestamp: string;
  snapshotLabel: string;
  timelineLabel: string;
  home?: number;
  draw?: number;
  away?: number;
}

interface IndexedSnapshot {
  snapshot: OddsSnapshot;
  originalIndex: number;
  rawTimestamp: string;
  timestampMs: number | undefined;
}

function indexSnapshot(snapshot: OddsSnapshot, originalIndex: number): IndexedSnapshot {
  const rawTimestamp = snapshot.timestamp ?? snapshot.createdAt ?? "";
  const parsedTimestamp = Date.parse(rawTimestamp);

  return {
    snapshot,
    originalIndex,
    rawTimestamp,
    timestampMs: Number.isNaN(parsedTimestamp) ? undefined : parsedTimestamp,
  };
}

/** Builds a bounded chart model without presenting inferred capture times as real timestamps. */
export function buildMarketTimeline(
  snapshots: OddsSnapshot[],
  mustKeepIds: Set<string> = new Set(),
  maxNonSignalPoints = 18
): MarketTimelinePoint[] {
  const deduplicatedById = new Map<string, IndexedSnapshot>();
  const snapshotsWithoutIds: IndexedSnapshot[] = [];

  snapshots.forEach((snapshot, originalIndex) => {
    const indexed = indexSnapshot(snapshot, originalIndex);
    if (snapshot.id) {
      deduplicatedById.set(snapshot.id, indexed);
    } else {
      snapshotsWithoutIds.push(indexed);
    }
  });

  const sorted = [...deduplicatedById.values(), ...snapshotsWithoutIds].sort((left, right) => {
    if (left.timestampMs !== undefined && right.timestampMs !== undefined) {
      return left.timestampMs - right.timestampMs || left.originalIndex - right.originalIndex;
    }
    if (left.timestampMs !== undefined) return -1;
    if (right.timestampMs !== undefined) return 1;
    return left.originalIndex - right.originalIndex;
  });

  const required = sorted.filter(({ snapshot }) => snapshot.id && mustKeepIds.has(snapshot.id));
  const nonSignal = sorted.filter(({ snapshot }) => !snapshot.id || !mustKeepIds.has(snapshot.id));
  const nonSignalLimit = Math.max(0, maxNonSignalPoints);
  const boundedNonSignal = nonSignalLimit === 0 ? [] : nonSignal.slice(-nonSignalLimit);
  const retainedIndexes = new Set(
    [...required, ...boundedNonSignal].map(({ originalIndex }) => originalIndex)
  );
  const retained = sorted.filter(({ originalIndex }) => retainedIndexes.has(originalIndex));

  let precedingTimelineX = -1;

  return retained.map(({ snapshot, originalIndex, rawTimestamp, timestampMs }, index) => {
    const prices = snapshot.market ?? snapshot;
    const hasRealTimestamp = timestampMs !== undefined;
    const timelineX = hasRealTimestamp ? timestampMs : precedingTimelineX + 1;
    const snapshotNumber = index + 1;
    precedingTimelineX = timelineX;

    return {
      id: snapshot.id ?? `snapshot-${originalIndex}`,
      name: hasRealTimestamp ? formatTime(rawTimestamp) : `S${snapshotNumber}`,
      timelineX,
      hasRealTimestamp,
      rawTimestamp,
      snapshotLabel: `TxLINE snapshot ${snapshotNumber}`,
      timelineLabel: hasRealTimestamp
        ? `Captured at ${formatTime(rawTimestamp)}`
        : "Capture time unavailable",
      home: prices.homeOdds,
      draw: prices.drawOdds,
      away: prices.awayOdds,
    };
  });
}
