import { Card } from "../../components/ui/Card";
import { StatusCapsule } from "../../components/ui/widgets/StatusCapsule";
import type { Health } from "../../types";
import type { LiveMarketsFieldContext } from "./LiveMarketsPage";

export interface IntelligenceRailProps {
  chartDataCount: number;
  isReplayStreamMode: boolean;
  onToggleReplayStreamMode: () => void;
  isOddsStreamLive: boolean;
  oddsStreamLastUpdate?: string;
  replayStreamProgress?: string;
  health: Health | null;
  correctSignals: number;
  closedSignals: number;
  fieldContext: LiveMarketsFieldContext;
  hasDroppedUpdate: boolean;
}

/**
 * The workspace's right-hand summary column - stream health, field context,
 * and audit state, plus the replay control. Deliberately doesn't repeat the
 * verdict/odds/chart already shown on the left (severity stays owned by the
 * verdict card); every value here is real data already flowing into
 * LiveMarketsPage, nothing invented.
 */
export function IntelligenceRail({
  chartDataCount,
  isReplayStreamMode,
  onToggleReplayStreamMode,
  isOddsStreamLive,
  oddsStreamLastUpdate,
  replayStreamProgress,
  health,
  correctSignals,
  closedSignals,
  fieldContext,
  hasDroppedUpdate,
}: IntelligenceRailProps) {
  const tickAndEvents = [
    oddsStreamLastUpdate ? `Tick ${oddsStreamLastUpdate}` : null,
    health?.liveStream?.connected ? `⛓ ${health.liveStream.totalEventsReceived ?? 0} events` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="space-y-3 p-4 xl:sticky xl:top-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Intelligence rail</p>

      <StatusCapsule
        label={`Last ${chartDataCount} snapshots`}
        value={isReplayStreamMode ? "Demo replay" : isOddsStreamLive ? "Stream active" : "Connecting"}
        tone={isReplayStreamMode ? "info" : isOddsStreamLive ? "positive" : "warning"}
        pulse={!isReplayStreamMode && isOddsStreamLive}
      />
      {tickAndEvents && <p className="truncate text-[10px] leading-4 text-stone-500">{tickAndEvents}</p>}

      <StatusCapsule label="Field context" value={fieldContext.label} tone={fieldContext.tone} />

      <StatusCapsule
        label="Outcome audit"
        value={`${correctSignals} / ${closedSignals}`}
        tone={correctSignals > 0 ? "positive" : "neutral"}
      />
      <p className="text-[10px] leading-4 text-stone-500">Confirmed vs. closed signals in this session so far.</p>

      {hasDroppedUpdate && (
        <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-[10px] leading-4 text-warning-200">
          One update was skipped (parse issue) — the stream is still running.
        </p>
      )}

      <button
        type="button"
        onClick={onToggleReplayStreamMode}
        className={`w-full rounded-lg border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          isReplayStreamMode
            ? "border-info/40 bg-info-500/15 text-info-100"
            : "border-border bg-white/5 text-stone-300 hover:border-white/20"
        }`}
      >
        {isReplayStreamMode ? "Stop demo replay" : "Start demo replay"}
      </button>
      {isReplayStreamMode && (
        <p className="rounded-lg border border-info/20 bg-info-500/10 px-3 py-2 text-[10px] leading-4 text-info-100">
          {replayStreamProgress || "Demo replay using saved real TxLINE snapshots"}
        </p>
      )}
    </Card>
  );
}
