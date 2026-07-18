import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronRight } from "lucide-react";
import { formatOdds, formatOddsChange, severityMarkerStyle } from "../../lib/formatters";
import type { Match } from "../../types";
import type { LiveMarketsChartMarker, LiveMarketsChartPoint, LiveMarketsChartReadout } from "./LiveMarketsPage";
import { replayProgressLabel, type ReplayStatus } from "./replayState";

export interface OddsMovementChartProps {
  selectedMatch?: Match;
  chartData: LiveMarketsChartPoint[];
  chartSignalMarkers: LiveMarketsChartMarker[];
  /** Kept optional during the page-composition migration; the selected-market tape owns this content. */
  chartReadout?: LiveMarketsChartReadout;
  onSelectSignalId: (signalId: string) => void;
  isReplayStreamMode: boolean;
  isOddsStreamLive: boolean;
  streamProgressPercent: number;
  replayCursor?: number;
  replayTotal?: number;
  replayStatus?: ReplayStatus;
  replayOriginalTimestamp?: string;
  replayIntervalMs?: number;
}

const historicalTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const historicalDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

function formatHistoricalTimestamp(value: number): string {
  if (!Number.isFinite(value) || value < 10_000_000_000) return "Time unavailable";
  return historicalTimeFormatter.format(new Date(value));
}

function formatHistoricalCapture(point?: LiveMarketsChartPoint): string {
  if (!point?.hasRealTimestamp || !point.rawTimestamp) return "Capture time unavailable";
  const timestamp = Date.parse(point.rawTimestamp);
  return Number.isNaN(timestamp)
    ? "Capture time unavailable"
    : historicalDateTimeFormatter.format(new Date(timestamp));
}

function replayPosition(cursor: number | undefined, replayTotal: number | undefined, fallbackCount: number) {
  const current = cursor ?? fallbackCount;
  const total = replayTotal ?? fallbackCount;
  return {
    current: Math.max(0, Math.min(current, total)),
    total: Math.max(total, fallbackCount),
  };
}

export function OddsMovementChart({
  selectedMatch,
  chartData,
  chartSignalMarkers,
  onSelectSignalId,
  isReplayStreamMode,
  isOddsStreamLive,
  streamProgressPercent,
  replayCursor,
  replayTotal,
  replayStatus = "live",
  replayOriginalTimestamp,
  replayIntervalMs = 1000,
}: OddsMovementChartProps) {
  const hasHomeSeries = chartData.some((point) => point.home != null);
  const hasDrawSeries = chartData.some((point) => point.draw != null);
  const hasAwaySeries = chartData.some((point) => point.away != null);
  const isFinishedMatch = selectedMatch?.status === "finished";
  const matchLabel = selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "selected market";
  const chartDescriptionId = "live-market-chart-description";
  const marketContextLabel = isReplayStreamMode
    ? "Replay window"
    : selectedMatch?.status === "scheduled"
      ? "Pre-match window"
      : selectedMatch?.status === "finished"
        ? "Finished window"
        : "Live window";
  const progressLabel = isReplayStreamMode
    ? replayProgressLabel({ status: replayStatus, cursor: replayCursor ?? 0, total: replayTotal ?? 0, originalTimestamp: replayOriginalTimestamp, intervalMs: replayIntervalMs })
    : isOddsStreamLive
      ? `${chartData.length} snapshots in view`
      : "Waiting for the next snapshot";
  const latestPoint = chartData[chartData.length - 1];
  const position = replayPosition(replayCursor, replayTotal, chartData.length);
  const railSegmentCount = Math.max(1, Math.min(position.total, 20));
  const completedRailSegments = Math.round((position.current / Math.max(position.total, 1)) * railSegmentCount);
  const formatHistoricalAxisTime = (value: number) => {
    const capturedPoint = chartData.find((point) => point.timelineX === value);
    return capturedPoint && !capturedPoint.hasRealTimestamp
      ? "Time unavailable"
      : formatHistoricalTimestamp(value);
  };
  const historicalEndLabel = isReplayStreamMode && position.current < position.total
    ? "Capture time unavailable"
    : formatHistoricalCapture(latestPoint);
  const chartDescription = chartData.every((point) => point.hasRealTimestamp)
    ? "Each point is a real TxLINE snapshot plotted by its capture timestamp."
    : "Timestamped TxLINE snapshots use capture timestamps; unavailable captures use sequence order and remain labelled unavailable.";

  return (
    <section id="guide-odds-chart" aria-labelledby="odds-movement-title" className="min-w-0 p-3 sm:p-4">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes market-capture-cursor-in {
            from { opacity: 0.2; transform: scaleX(0.985); }
            to { opacity: 0.9; transform: scaleX(1); }
          }
          .market-capture-cursor {
            animation: market-capture-cursor-in 300ms ease-out;
            transform-box: fill-box;
            transform-origin: center;
          }
        }
      `}</style>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500">Selected price tape</p>
          <h3 id="odds-movement-title" className="font-display text-base font-bold text-white">Odds movement</h3>
          <p className="mt-0.5 text-[11px] text-stone-500">Observed price holds until the next snapshot; lower decimal odds mean stronger market favor.</p>
        </div>
        <span className="rounded-md border border-border bg-black/25 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-stone-400">
          {marketContextLabel}
        </span>
      </div>

      {chartData.length > 0 ? (
        <>
          <div
            role="img"
            aria-label={`Odds movement for ${matchLabel}`}
            aria-describedby={chartDescriptionId}
            className="h-[17rem] min-w-0 rounded-lg bg-black/20 p-2 sm:h-[20rem]"
          >
            <p id={chartDescriptionId} className="sr-only">
              {chartDescription} Observed prices hold until the next snapshot. Lower decimal odds indicate stronger market favor.
            </p>
            <div className="mb-1 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500" aria-hidden="true">
              <span>Historical capture time</span>
              <span>Decimal odds</span>
            </div>
            <ResponsiveContainer width="100%" height="94%">
              <AreaChart data={chartData} margin={{ top: 22, right: 26, left: 22, bottom: 4 }}>
                <defs>
                  <linearGradient id="lmAreaHome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffb020" stopOpacity={0.38} />
                    <stop offset="100%" stopColor="#ffb020" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lmAreaAway" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2fd6b4" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#2fd6b4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(158,196,224,0.08)" strokeDasharray="2 6" strokeLinecap="round" vertical={false} />
                <XAxis
                  dataKey="timelineX"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#a8a29e", fontSize: 10 }}
                  tickFormatter={formatHistoricalAxisTime}
                />
                <YAxis
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  tick={{ fill: "#a8a29e", fontSize: 10 }}
                  tickFormatter={(value) => Number(value).toFixed(2)}
                  domain={["dataMin - 0.05", "dataMax + 0.05"]}
                />
                <Tooltip
                  cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1, strokeDasharray: "4 4" }}
                  wrapperStyle={{ zIndex: 50 }}
                  content={(tooltipProps) => {
                    const payload = tooltipProps.payload ?? [];
                    const point = payload[0]?.payload as LiveMarketsChartPoint | undefined;
                    const marker = chartSignalMarkers.find((currentMarker) => currentMarker.x === tooltipProps.label);
                    if (!point) return null;
                    const snapshotNumber = chartData.findIndex((candidate) => candidate.id === point.id) + 1;

                    return (
                      <div className="w-[240px] rounded-lg border border-border bg-surface-1/95 p-3 text-xs text-stone-100 shadow-2xl shadow-black/50">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-info-200/70">
                          Snapshot {snapshotNumber || "—"} of {chartData.length}
                        </p>
                        <p className="mt-1 text-[11px] text-stone-300">{formatHistoricalCapture(point)}</p>
                        <div className="mt-3 grid gap-1.5">
                          {point.home != null && (
                            <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                              <span className="text-stone-400">{selectedMatch?.homeTeam ?? "Home"}</span>
                              <span className="font-mono font-semibold text-accent-200">{formatOdds(point.home)}</span>
                            </div>
                          )}
                          {point.draw != null && (
                            <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                              <span className="text-stone-400">Draw</span>
                              <span className="font-mono font-semibold text-proof-200">{formatOdds(point.draw)}</span>
                            </div>
                          )}
                          {point.away != null && (
                            <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                              <span className="text-stone-400">{selectedMatch?.awayTeam ?? "Away"}</span>
                              <span className="font-mono font-semibold text-positive-200">{formatOdds(point.away)}</span>
                            </div>
                          )}
                        </div>
                        {marker && (
                          <div className="mt-2 border-t border-white/10 pt-2 text-[11px]">
                            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent-100">Signal evidence</p>
                            <p className="mt-1 font-semibold text-white">{marker.label}</p>
                            <p className="mt-0.5 text-stone-400">
                              {marker.target ?? "Tracked market"} · {formatOddsChange(marker.oddsChangePct)}
                            </p>
                            {marker.explanation && <p className="mt-1 leading-4 text-stone-400">{marker.explanation}</p>}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                {hasHomeSeries && (
                  <Area
                    type="stepAfter"
                    dataKey="home"
                    stroke="#ffb020"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    fill="url(#lmAreaHome)"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, style: { filter: "drop-shadow(0 0 4px rgba(255,176,32,0.7))" } }}
                    isAnimationActive={false}
                    name="Home odds"
                  />
                )}
                {hasDrawSeries && (
                  <Area
                    type="stepAfter"
                    dataKey="draw"
                    stroke="#a78bfa"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    fillOpacity={0}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, style: { filter: "drop-shadow(0 0 4px rgba(167,139,250,0.7))" } }}
                    isAnimationActive={false}
                    name="Draw odds"
                  />
                )}
                {hasAwaySeries && (
                  <Area
                    type="stepAfter"
                    dataKey="away"
                    stroke="#2fd6b4"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    fill="url(#lmAreaAway)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, style: { filter: "drop-shadow(0 0 4px rgba(47,214,180,0.7))" } }}
                    isAnimationActive={false}
                    name="Away odds"
                  />
                )}
                {chartSignalMarkers.map((marker) => {
                  const markerStyle = severityMarkerStyle(marker.severity);
                  return (
                    <ReferenceDot
                      key={marker.id}
                      x={marker.x}
                      y={marker.y}
                      r={markerStyle.radius}
                      stroke="#ffecc7"
                      strokeWidth={2}
                      fill={markerStyle.fill}
                      label={{
                        value: "Signal",
                        position: "bottom",
                        fill: "#ffd98f",
                        fontSize: 10,
                        fontWeight: 600,
                        stroke: "#0b0f14",
                        strokeWidth: 3,
                        paintOrder: "stroke",
                      }}
                      onClick={() => onSelectSignalId(marker.id)}
                      style={{ cursor: "pointer" }}
                    />
                  );
                })}
                {latestPoint && (
                  <ReferenceLine
                    key={latestPoint.id}
                    x={latestPoint.timelineX}
                    stroke="#f8fafc"
                    strokeWidth={1.5}
                    strokeOpacity={0.9}
                    label={{
                      value: "Current",
                      position: "insideBottomRight",
                      fill: "#f8fafc",
                      fontSize: 9,
                      fontWeight: 600,
                      stroke: "#0b0f14",
                      strokeWidth: 3,
                      paintOrder: "stroke",
                    }}
                    className="market-capture-cursor motion-reduce:transition-none"
                  />
                )}
                {latestPoint?.home != null && <ReferenceDot x={latestPoint.timelineX} y={latestPoint.home} r={3.5} fill="#ffb020" stroke="#fff7e6" strokeWidth={1.5} />}
                {latestPoint?.draw != null && <ReferenceDot x={latestPoint.timelineX} y={latestPoint.draw} r={3.5} fill="#a78bfa" stroke="#f3efff" strokeWidth={1.5} />}
                {latestPoint?.away != null && <ReferenceDot x={latestPoint.timelineX} y={latestPoint.away} r={3.5} fill="#2fd6b4" stroke="#e6fffa" strokeWidth={1.5} />}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <table className="sr-only">
            <caption>Odds movement data for {matchLabel}</caption>
            <thead>
              <tr>
                <th>Snapshot</th>
                {hasHomeSeries && <th>Home odds</th>}
                {hasDrawSeries && <th>Draw odds</th>}
                {hasAwaySeries && <th>Away odds</th>}
              </tr>
            </thead>
            <tbody>
              {chartData.map((point, index) => (
                <tr key={`${point.id}-${index}`}>
                  <th>{point.timelineLabel ?? point.name}</th>
                  {hasHomeSeries && <td>{formatOdds(point.home)}</td>}
                  {hasDrawSeries && <td>{formatOdds(point.draw)}</td>}
                  {hasAwaySeries && <td>{formatOdds(point.away)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-border bg-black/20 p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-stone-300">
              {isFinishedMatch
                ? `No recovered TxLINE snapshots for ${matchLabel}.`
                : `No TxLINE snapshots for ${matchLabel} yet.`}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {isFinishedMatch
                ? "No historical TxLINE odds were available for this finished fixture."
                : "The selected fixture stays in view while the next real update arrives."}
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 rounded-lg border border-white/8 bg-black/15 px-3 py-2.5">
        <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8 max-sm:w-full max-sm:flex-none" aria-hidden="true">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent via-proof to-positive motion-safe:transition-[width,opacity,transform] motion-safe:duration-500 motion-safe:ease-out motion-reduce:transition-none"
              style={{ width: isReplayStreamMode ? `${streamProgressPercent}%` : isOddsStreamLive ? "100%" : "8%" }}
            />
            <div className="absolute inset-0 flex gap-px">
              {Array.from({ length: railSegmentCount }, (_, index) => (
                <span
                  key={index}
                  className={`h-full flex-1 border-r border-black/35 ${index < completedRailSegments ? "opacity-20" : "opacity-80"}`}
                />
              ))}
            </div>
          </div>
          <span className="font-mono text-[10px] text-stone-500 max-sm:text-right">{progressLabel}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[9px] text-stone-500">
          <span><span className="block uppercase tracking-wide text-stone-600">Start</span>{formatHistoricalCapture(chartData[0])}</span>
          <span className="text-center"><span className="block uppercase tracking-wide text-stone-600">Current</span>{formatHistoricalCapture(latestPoint)}</span>
          <span className="text-right"><span className="block uppercase tracking-wide text-stone-600">End</span>{historicalEndLabel}</span>
        </div>
        <p role="status" aria-label="Replay position" aria-live="polite" className="sr-only">
          Snapshot {position.current} of {position.total}. Historical capture position. {formatHistoricalCapture(latestPoint)}.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-[10px] text-stone-500">
        {hasHomeSeries && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />{selectedMatch?.homeTeam ?? "Home"}</span>}
        {hasDrawSeries && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-proof" />Draw</span>}
        {hasAwaySeries && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-positive" />{selectedMatch?.awayTeam ?? "Away"}</span>}
      </div>

      {chartSignalMarkers.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Signals on this chart">
          {chartSignalMarkers.map((marker) => {
            const markerStyle = severityMarkerStyle(marker.severity);
            const severityLabel = marker.severity?.toUpperCase() ?? "UNRATED";
            return (
              <button
                key={marker.id}
                type="button"
                aria-label={`Inspect signal ${marker.label}`}
                onClick={() => onSelectSignalId(marker.id)}
                className="group flex min-h-11 items-center gap-3 rounded-lg border border-border bg-black/20 px-3 py-2 text-left transition-colors hover:border-accent/30 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: markerStyle.fill }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white">{marker.label}</span>
                  <span className="block truncate font-mono text-[10px] text-stone-500">
                    {severityLabel} · {marker.target ?? "Tracked market"} · {formatOddsChange(marker.oddsChangePct)}
                  </span>
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-100">Inspect signal</span>
                <ChevronRight className="h-4 w-4 text-stone-600 group-hover:text-accent-100" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
