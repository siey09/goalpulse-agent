import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronRight } from "lucide-react";
import { formatOdds, formatOddsChange, severityMarkerStyle } from "../../lib/formatters";
import type { Match } from "../../types";
import type { LiveMarketsChartMarker, LiveMarketsChartPoint, LiveMarketsChartReadout } from "./LiveMarketsPage";

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
  replayStreamProgress?: string;
}

export function OddsMovementChart({
  selectedMatch,
  chartData,
  chartSignalMarkers,
  onSelectSignalId,
  isReplayStreamMode,
  isOddsStreamLive,
  streamProgressPercent,
  replayStreamProgress,
}: OddsMovementChartProps) {
  const hasHomeSeries = chartData.some((point) => point.home != null);
  const hasDrawSeries = chartData.some((point) => point.draw != null);
  const hasAwaySeries = chartData.some((point) => point.away != null);
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
    ? replayStreamProgress || "Replay ready"
    : isOddsStreamLive
      ? `${chartData.length} snapshots in view`
      : "Waiting for the next snapshot";

  return (
    <section id="guide-odds-chart" aria-labelledby="odds-movement-title" className="min-w-0 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500">Selected price tape</p>
          <h3 id="odds-movement-title" className="font-display text-base font-bold text-white">Odds movement</h3>
          <p className="mt-0.5 text-[11px] text-stone-500">Each point is a TxLINE snapshot; lower decimal odds mean stronger market favor.</p>
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
              Each point is a real TxLINE snapshot. Lower decimal odds indicate stronger market favor.
            </p>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 18, left: 0, bottom: 4 }}>
                <defs>
                  <pattern id="lmPixelHome" width="8" height="8" patternUnits="userSpaceOnUse">
                    <rect width="8" height="8" fill="transparent" />
                    <rect width="4" height="4" fill="#ffb020" fillOpacity={0.56} />
                  </pattern>
                  <pattern id="lmPixelAway" width="8" height="8" patternUnits="userSpaceOnUse">
                    <rect width="8" height="8" fill="transparent" />
                    <rect width="4" height="4" fill="#2fd6b4" fillOpacity={0.4} />
                  </pattern>
                </defs>
                <CartesianGrid stroke="rgba(158,196,224,0.22)" strokeDasharray="1 7" strokeLinecap="round" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#a8a29e", fontSize: 10 }} />
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

                    return (
                      <div className="w-[240px] rounded-lg border border-border bg-surface-1/95 p-3 text-xs text-stone-100 shadow-2xl shadow-black/50">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-info-200/70">
                          {point.snapshotLabel ?? "TxLINE snapshot"}
                        </p>
                        <p className="mt-1 text-[11px] text-stone-400">{point.timelineLabel ?? "Odds history point"}</p>
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
                        {marker && <p className="mt-2 text-[11px] font-semibold text-accent-100">Signal · {marker.label}</p>}
                      </div>
                    );
                  }}
                />
                {hasHomeSeries && (
                  <Area
                    type="monotone"
                    dataKey="home"
                    stroke="#ffb020"
                    strokeWidth={2.8}
                    fill="url(#lmPixelHome)"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                    isAnimationActive={false}
                    name="Home odds"
                  />
                )}
                {hasDrawSeries && (
                  <Area
                    type="monotone"
                    dataKey="draw"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    fillOpacity={0}
                    dot={false}
                    isAnimationActive={false}
                    name="Draw odds"
                  />
                )}
                {hasAwaySeries && (
                  <Area
                    type="monotone"
                    dataKey="away"
                    stroke="#2fd6b4"
                    strokeWidth={2}
                    fill="url(#lmPixelAway)"
                    dot={false}
                    activeDot={{ r: 4 }}
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
                      label={{ value: "Signal", position: "top", fill: "#ffd98f", fontSize: 10 }}
                      onClick={() => onSelectSignalId(marker.id)}
                      style={{ cursor: "pointer" }}
                    />
                  );
                })}
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
              {chartData.map((point) => (
                <tr key={`${point.name}-${point.timelineLabel ?? "snapshot"}`}>
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
            <p className="text-sm font-semibold text-stone-300">No TxLINE snapshots for {matchLabel} yet.</p>
            <p className="mt-1 text-xs text-stone-500">The selected fixture stays in view while the next real update arrives.</p>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8" aria-hidden="true">
          <div
            className="h-1 rounded-full bg-gradient-to-r from-accent via-proof to-positive transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: isReplayStreamMode ? `${streamProgressPercent}%` : isOddsStreamLive ? "100%" : "8%" }}
          />
        </div>
        <span className="shrink-0 font-mono text-[10px] text-stone-500">{progressLabel}</span>
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
                    {marker.target ?? "Tracked market"} · {formatOddsChange(marker.oddsChangePct)}
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
