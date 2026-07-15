import { OddsMovementChart } from "./OddsMovementChart";
import { LiveMarketToolbar } from "./LiveMarketToolbar";
import { MarketEvidenceStrip } from "./MarketEvidenceStrip";
import { MarketFixtureRail } from "./MarketFixtureRail";
import { SelectedMarketWorkspace } from "./SelectedMarketWorkspace";
import type { Match, Health } from "../../types";
import type { MarketTimelinePoint } from "./chartTimeline";
import type { ReplayInterval, ReplaySpeed, ReplayStatus } from "./replayState";

export type LiveMarketsChartPoint = MarketTimelinePoint;

export interface LiveMarketsChartMarker {
  id: string;
  x: number;
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
  replayStatus: ReplayStatus;
  replaySpeed: ReplaySpeed;
  replayCursor: number;
  replayTotal: number;
  replayOriginalTimestamp?: string;
  replayIntervalMs: ReplayInterval;
  replayProgressLabel: string;
  onPlayReplay: () => void;
  onPauseReplay: () => void;
  onRestartReplay: () => void;
  onExitReplay: () => void;
  onChangeReplaySpeed: (speed: ReplaySpeed) => void;
  isOddsStreamLive: boolean;
  oddsStreamLastUpdate?: string;
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

/** The operator cockpit keeps selection, price movement, and evidence in one connected scan path. */
export function LiveMarketsPage(props: LiveMarketsPageProps) {
  return (
    <div className="min-w-0 space-y-4">
      <LiveMarketToolbar
        hasChartData={props.chartData.length > 0}
        isReplayStreamMode={props.isReplayStreamMode}
        replayStatus={props.replayStatus}
        replaySpeed={props.replaySpeed}
        replayProgressLabel={props.replayProgressLabel}
        onPlayReplay={props.onPlayReplay}
        onPauseReplay={props.onPauseReplay}
        onRestartReplay={props.onRestartReplay}
        onExitReplay={props.onExitReplay}
        onChangeReplaySpeed={props.onChangeReplaySpeed}
        isOddsStreamLive={props.isOddsStreamLive}
        oddsStreamLastUpdate={props.oddsStreamLastUpdate}
        hasDroppedUpdate={props.hasDroppedUpdate}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(18rem,0.38fr)_minmax(0,1fr)] xl:items-start">
        <MarketFixtureRail
          matches={props.matches}
          selectedMatch={props.selectedMatch}
          matchStatusFilter={props.matchStatusFilter}
          onChangeMatchStatusFilter={props.onChangeMatchStatusFilter}
          matchStatusCounts={props.matchStatusCounts}
          selectedMatchId={props.selectedMatchId}
          onSelectMatch={props.onSelectMatch}
        />

        <section aria-label="Selected market workspace" className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface-1">
          <SelectedMarketWorkspace
            selectedMatch={props.selectedMatch}
            chartData={props.chartData}
            chartReadout={props.chartReadout}
            selectedMatchMarketPressure={props.selectedMatchMarketPressure}
            isReplayStreamMode={props.isReplayStreamMode}
          />
          <OddsMovementChart
            selectedMatch={props.selectedMatch}
            chartData={props.chartData}
            chartSignalMarkers={props.chartSignalMarkers}
            onSelectSignalId={props.onSelectSignalId}
            isReplayStreamMode={props.isReplayStreamMode}
            isOddsStreamLive={props.isOddsStreamLive}
            streamProgressPercent={props.streamProgressPercent}
            replayCursor={props.replayCursor}
            replayTotal={props.replayTotal}
            replayStatus={props.replayStatus}
            replayOriginalTimestamp={props.replayOriginalTimestamp}
            replayIntervalMs={props.replayIntervalMs}
          />
          <MarketEvidenceStrip
            chartDataCount={props.chartData.length}
            health={props.health}
            correctSignals={props.correctSignals}
            closedSignals={props.closedSignals}
            fieldContext={props.fieldContext}
            signalCount={props.chartSignalMarkers.length}
          />
        </section>
      </div>
    </div>
  );
}
