import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsSnapshot } from "../types";
import {
  enqueueOddsSnapshotsForArchive,
  flushOddsSnapshotArchive,
  getOddsArchiveOutboxStats,
  resetOddsArchiveOutboxForTests,
} from "./oddsArchiveOutbox";

function makeSnapshot(id: string): OddsSnapshot {
  return {
    id,
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2,
    drawOdds: 3.2,
    awayOdds: 3.8,
    homeScore: 0,
    awayScore: 0,
    minute: 20,
    source: "txline",
    createdAt: "2026-07-15T10:00:00.000Z",
  };
}

describe("odds archive outbox", () => {
  beforeEach(() => {
    resetOddsArchiveOutboxForTests();
  });

  it("retains failed writes and retries them on the next flush", async () => {
    const writer = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await enqueueOddsSnapshotsForArchive([makeSnapshot("snapshot-1")], writer);
    expect(getOddsArchiveOutboxStats()).toMatchObject({ pending: 1, failures: 1 });

    await flushOddsSnapshotArchive(writer);
    expect(writer).toHaveBeenCalledTimes(2);
    expect(getOddsArchiveOutboxStats()).toEqual({
      pending: 0,
      failures: 0,
      lastFailureAt: null,
    });
  });

  it("deduplicates queued snapshots by id", async () => {
    const writer = vi.fn().mockResolvedValue(false);

    await enqueueOddsSnapshotsForArchive(
      [makeSnapshot("snapshot-1"), makeSnapshot("snapshot-1")],
      writer
    );

    expect(getOddsArchiveOutboxStats().pending).toBe(1);
    expect(writer).toHaveBeenCalledWith([expect.objectContaining({ id: "snapshot-1" })]);
  });
});
