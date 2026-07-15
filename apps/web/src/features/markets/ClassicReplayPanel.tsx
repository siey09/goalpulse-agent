import type { Health } from "../../types";
import { ReplayControls, type ReplayControlsProps } from "./ReplayControls";

export interface ClassicReplayPanelProps extends ReplayControlsProps {
  snapshotCount: number;
  replayProgressLabel: string;
  isOddsStreamLive: boolean;
  oddsStreamLastUpdate?: string;
  liveStream?: Health["liveStream"];
}

export function ClassicReplayPanel({
  snapshotCount,
  replayProgressLabel,
  isOddsStreamLive,
  oddsStreamLastUpdate,
  liveStream,
  ...controls
}: ClassicReplayPanelProps) {
  const isReplayActive = controls.replayStatus !== "live";

  return (
    <div className="max-w-[320px] rounded-xl border border-border bg-black/25 px-3 py-2 text-right">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Timeline view</p>
      <p className="mt-1 text-xs font-semibold text-white">Last {snapshotCount} TxLINE snapshots</p>
      <p className="mt-1 text-[10px] leading-4 text-stone-500">S1-S{snapshotCount} are odds captures, not match minutes.</p>
      <p className={`mt-2 text-[10px] font-semibold ${isReplayActive ? "text-info-200" : isOddsStreamLive ? "text-positive-200" : "text-warning-200"}`}>
        {isReplayActive ? "HISTORICAL REPLAY" : isOddsStreamLive ? "DATA STREAM ACTIVE" : "CONNECTING DATA STREAM"}
      </p>
      {oddsStreamLastUpdate && <p className="mt-1 text-[10px] text-stone-500">Last feed update {oddsStreamLastUpdate}</p>}
      {liveStream && (
        <p className={`mt-2 text-[10px] font-semibold ${liveStream.connected ? "text-positive-200" : "text-stone-500"}`} title={liveStream.lastError ?? undefined}>
          {liveStream.connected
            ? `⛓ TxLINE push feed connected (${liveStream.totalEventsReceived ?? 0} events)`
            : "⛓ TxLINE push feed reconnecting…"}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <ReplayControls {...controls} />
      </div>
      <p role="status" aria-label="Replay state" aria-live="polite" className="mt-2 text-[10px] leading-4 text-info-100">
        {replayProgressLabel}
      </p>
    </div>
  );
}
