import { SelectedMatchPanel } from "./SelectedMatchPanel";
import { OddsMovementChart } from "./OddsMovementChart";
import { IntelligenceRail } from "./IntelligenceRail";
import { MarketBoard } from "./MarketBoard";
import type { Match, Health } from "../../types";

export interface LiveMarketsChartPoint {
  name: string;
  home?: number;
  draw?: number;
  away?: number;
  snapshotLabel?: string;
  timelineLabel?: string;
}

export interface LiveMarketsChartMarker {
  id: string;
  x: string;
  y?: number;
  severity?: string;
  label: string;
  target?: string;
  oddsBefore?: number;
  oddsAfter?: number;
  oddsChangePct?: number;
  confidenceScore?: number;
  fieldPressureScore?: number;
  explanation?: string;
}

export interface LiveMarketsChartReadout {
  homeCurrent: string;
  drawCurrent: string;
  awayCurrent: string;
  verdict: string;
  meaning: string;
  signalStatus: string;
  severity: {
    tier: string;
    cardClass: string;
    textClass: string;
    dotClass: string;
    badgeClass: string;
  };
}

export interface LiveMarketsMarketPressure {
  homePressure: number;
  awayPressure: number;
  leader: string;
  /** False when no signal has fired for this match yet - the bars have nothing real to show. */
  hasData: boolean;
}

/** Field-backed / market-only / no-context-yet, reusing the same fieldPressureScore >= 22 threshold and tone convention as SignalIntelligencePanel. */
export interface LiveMarketsFieldContext {
  label: string;
  tone: "positive" | "neutral";
}

export interface LiveMarketsPageProps {
  selectedMatch?: Match;
  chartData: LiveMarketsChartPoint[];
  chartSignalMarkers: LiveMarketsChartMarker[];
  chartReadout: LiveMarketsChartReadout;
  isReplayStreamMode: boolean;
  onToggleReplayStreamMode: () => void;
  isOddsStreamLive: boolean;
  oddsStreamLastUpdate?: string;
  replayStreamProgress?: string;
  streamProgressPercent: number;
  health: Health | null;
  correctSignals: number;
  closedSignals: number;
  selectedMatchMarketPressure: LiveMarketsMarketPressure;
  fieldContext: LiveMarketsFieldContext;
  /** True briefly after an SSE tick fails to parse - a small non-blocking notice, never the raw payload. */
  hasDroppedUpdate: boolean;

  matches: Match[];
  matchStatusFilter?: string;
  onChangeMatchStatusFilter: (status: "all" | "live" | "scheduled" | "finished") => void;
  matchStatusCounts: { all: number; live: number; scheduled: number; finished: number };
  selectedMatchId: string;
  onSelectMatch: (matchId: string) => void;
  onSelectSignalId: (signalId: string) => void;
}

/**
 * Live Markets, composed from four focused pieces instead of one long
 * scroll of markup: SelectedMatchPanel (match command header),
 * OddsMovementChart (the workspace's main visual focus, left column),
 * IntelligenceRail (stream/audit summary, right column), and MarketBoard
 * (the full match list, table on tablet/desktop, cards on mobile). Prop
 * contract is unchanged from the previous single-file version, so App.tsx
 * needs no changes.
 */
export function LiveMarketsPage({
  selectedMatch,
  chartData,
  chartSignalMarkers,
  chartReadout,
  isReplayStreamMode,
  onToggleReplayStreamMode,
  isOddsStreamLive,
  oddsStreamLastUpdate,
  replayStreamProgress,
  streamProgressPercent,
  health,
  correctSignals,
  closedSignals,
  selectedMatchMarketPressure,
  fieldContext,
  hasDroppedUpdate,
  matches,
  matchStatusFilter,
  onChangeMatchStatusFilter,
  matchStatusCounts,
  selectedMatchId,
  onSelectMatch,
  onSelectSignalId,
}: LiveMarketsPageProps) {
  return (
    <div className="space-y-4">
      <SelectedMatchPanel
        selectedMatch={selectedMatch}
        selectedMatchMarketPressure={selectedMatchMarketPressure}
        hasChartData={chartData.length > 0}
        isReplayStreamMode={isReplayStreamMode}
        isOddsStreamLive={isOddsStreamLive}
        oddsStreamLastUpdate={oddsStreamLastUpdate}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <OddsMovementChart
            selectedMatch={selectedMatch}
            chartData={chartData}
            chartSignalMarkers={chartSignalMarkers}
            chartReadout={chartReadout}
            onSelectSignalId={onSelectSignalId}
            isReplayStreamMode={isReplayStreamMode}
            isOddsStreamLive={isOddsStreamLive}
            streamProgressPercent={streamProgressPercent}
            replayStreamProgress={replayStreamProgress}
          />
        </div>
        <div className="xl:col-span-4">
          <IntelligenceRail
            chartDataCount={chartData.length}
            isReplayStreamMode={isReplayStreamMode}
            onToggleReplayStreamMode={onToggleReplayStreamMode}
            isOddsStreamLive={isOddsStreamLive}
            oddsStreamLastUpdate={oddsStreamLastUpdate}
            replayStreamProgress={replayStreamProgress}
            health={health}
            correctSignals={correctSignals}
            closedSignals={closedSignals}
            fieldContext={fieldContext}
            hasDroppedUpdate={hasDroppedUpdate}
          />
        </div>
      </div>

      <MarketBoard
        matches={matches}
        matchStatusFilter={matchStatusFilter}
        onChangeMatchStatusFilter={onChangeMatchStatusFilter}
        matchStatusCounts={matchStatusCounts}
        selectedMatchId={selectedMatchId}
        onSelectMatch={onSelectMatch}
      />
    </div>
  );
}
