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

/** Finds the capture closest to a target using the same timestamp fallback as the chart model. */
export function findNearestMarketSnapshot(
  snapshots: OddsSnapshot[],
  targetTimestamp?: string
): OddsSnapshot | undefined {
  if (!targetTimestamp) return undefined;

  const targetMs = Date.parse(targetTimestamp);
  if (Number.isNaN(targetMs)) return undefined;

  let nearest: OddsSnapshot | undefined;
  let nearestDelta = Infinity;

  snapshots.forEach((snapshot, originalIndex) => {
    const timestampMs = indexSnapshot(snapshot, originalIndex).timestampMs;
    if (timestampMs === undefined) return;

    const delta = Math.abs(timestampMs - targetMs);
    if (delta < nearestDelta) {
      nearest = snapshot;
      nearestDelta = delta;
    }
  });

  return nearest;
}

function uniqueFallbackId(originalIndex: number, usedIds: Set<string>): string {
  const baseId = `snapshot-${originalIndex}`;
  let candidate = baseId;
  let suffix = 1;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-generated-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
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
  const usedPointIds = new Set(
    snapshots.flatMap((snapshot) => (snapshot.id ? [snapshot.id] : []))
  );

  let precedingTimelineX = -1;

  return retained.map(({ snapshot, originalIndex, rawTimestamp, timestampMs }, index) => {
    const prices = snapshot.market ?? snapshot;
    const hasRealTimestamp = timestampMs !== undefined;
    const timelineX = hasRealTimestamp ? timestampMs : precedingTimelineX + 1;
    const snapshotNumber = index + 1;
    precedingTimelineX = timelineX;

    return {
      id: snapshot.id ?? uniqueFallbackId(originalIndex, usedPointIds),
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
