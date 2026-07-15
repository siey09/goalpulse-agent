import type { OddsSnapshot } from "../types";
import { archiveOddsSnapshots } from "./archive";

const MAX_PENDING_SNAPSHOTS = 2_000;

export type OddsArchiveWriter = (snapshots: OddsSnapshot[]) => Promise<boolean>;

const pendingSnapshots = new Map<string, OddsSnapshot>();
let activeFlush: Promise<boolean> | null = null;
let failures = 0;
let lastFailureAt: string | null = null;

export function getOddsArchiveOutboxStats() {
  return {
    pending: pendingSnapshots.size,
    failures,
    lastFailureAt,
  };
}

export async function flushOddsSnapshotArchive(
  writer: OddsArchiveWriter = archiveOddsSnapshots
): Promise<boolean> {
  if (activeFlush) {
    return activeFlush;
  }

  const batch = [...pendingSnapshots.values()];
  if (batch.length === 0) {
    return true;
  }

  activeFlush = (async () => {
    const succeeded = await writer(batch);
    if (succeeded) {
      for (const snapshot of batch) {
        if (pendingSnapshots.get(snapshot.id) === snapshot) {
          pendingSnapshots.delete(snapshot.id);
        }
      }
      return true;
    }

    failures += 1;
    lastFailureAt = new Date().toISOString();
    return false;
  })().finally(() => {
    activeFlush = null;
  });

  return activeFlush;
}

export async function enqueueOddsSnapshotsForArchive(
  snapshots: OddsSnapshot[],
  writer: OddsArchiveWriter = archiveOddsSnapshots
): Promise<boolean> {
  for (const snapshot of snapshots) {
    pendingSnapshots.set(snapshot.id, snapshot);
  }

  while (pendingSnapshots.size > MAX_PENDING_SNAPSHOTS) {
    const oldestId = pendingSnapshots.keys().next().value as string | undefined;
    if (!oldestId) break;
    pendingSnapshots.delete(oldestId);
  }

  return flushOddsSnapshotArchive(writer);
}

export function resetOddsArchiveOutboxForTests(): void {
  pendingSnapshots.clear();
  activeFlush = null;
  failures = 0;
  lastFailureAt = null;
}
