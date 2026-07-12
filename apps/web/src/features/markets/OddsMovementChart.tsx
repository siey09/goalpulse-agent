import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp, Activity } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { formatOdds, formatOddsChange, severityMarkerStyle } from "../../lib/formatters";
import type { Match } from "../../types";
import type { LiveMarketsChartMarker, LiveMarketsChartPoint, LiveMarketsChartReadout } from "./LiveMarketsPage";

export interface OddsMovementChartProps {
  selectedMatch?: Match;
  chartData: LiveMarketsChartPoint[];
  chartSignalMarkers: LiveMarketsChartMarker[];
  chartReadout: LiveMarketsChartReadout;
  onSelectSignalId: (signalId: string) => void;
  isReplayStreamMode: boolean;
  isOddsStreamLive: boolean;
  streamProgressPercent: number;
  replayStreamProgress?: string;
}

type TickDirection = "up" | "down" | "flat" | null;

function tickDirection(chartData: LiveMarketsChartPoint[], key: "home" | "draw" | "away"): TickDirection {
  const current = chartData[chartData.length - 1]?.[key];
  const previous = chartData[chartData.length - 2]?.[key];
  if (current == null || previous == null) return null;
  if (current < previous) return "down";
  if (current > previous) return "up";
  return "flat";
}

/** Odds shortening/lengthening since the previous real TxLINE snapshot - never a value judgement, just the raw tick-over-tick direction. */
function TickIndicator({ direction }: { direction: TickDirection }) {
  if (!direction || direction === "flat") return null;
  const Icon = direction === "down" ? ArrowDown : ArrowUp;
  const label = direction === "down" ? "shortened since previous tick" : "lengthened since previous tick";
  return (
    <span className="inline-flex items-center text-stone-500" title={label}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The workspace's main visual focus - current odds, market verdict, and the
 * odds chart itself, given the full column width now that stream/audit
 * status lives in the IntelligenceRail instead of sharing this card's
 * header row. Live/replay/stale mode now lives once in SelectedMatchPanel's
 * header, so this card's own header keeps only the market-phase label
 * (pre-match / live / finished / demo replay) instead of repeating it.
 */
export function OddsMovementChart({
  selectedMatch,
  chartData,
  chartSignalMarkers,
  chartReadout,
  onSelectSignalId,
  isReplayStreamMode,
  isOddsStreamLive,
  streamProgressPercent,
  replayStreamProgress,
}: OddsMovementChartProps) {
  const marketContextLabel = isReplayStreamMode
    ? "Demo replay"
    : selectedMatch?.status === "scheduled"
      ? "Pre-match odds"
      : selectedMatch?.status === "live"
        ? "Live odds"
        : selectedMatch?.status === "finished"
          ? "Finished audit"
          : "Waiting";

  return (
    <Card id="guide-odds-chart" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">Selected market</h2>
        <span className="rounded-md border border-border bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-300">
          {marketContextLabel}
        </span>
      </div>

      <div className="mb-3 space-y-2">
        <div className="grid grid-cols-3 divide-x divide-white/8 rounded-lg bg-black/20">
          <div className="min-w-0 px-3 py-2.5">
            <p className="truncate text-[10px] uppercase tracking-[0.14em] text-stone-500">{selectedMatch?.homeTeam ?? "Home"}</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <p className="truncate font-mono text-lg font-bold tabular-nums text-accent-200 sm:text-xl">{chartReadout.homeCurrent}</p>
              <TickIndicator direction={tickDirection(chartData, "home")} />
            </div>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Draw</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <p className="truncate font-mono text-lg font-bold tabular-nums text-proof-200 sm:text-xl">{chartReadout.drawCurrent}</p>
              <TickIndicator direction={tickDirection(chartData, "draw")} />
            </div>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <p className="truncate text-[10px] uppercase tracking-[0.14em] text-stone-500">{selectedMatch?.awayTeam ?? "Away"}</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <p className="truncate font-mono text-lg font-bold tabular-nums text-positive-200 sm:text-xl">{chartReadout.awayCurrent}</p>
              <TickIndicator direction={tickDirection(chartData, "away")} />
            </div>
          </div>
        </div>
        <p className="px-1 text-[10px] text-stone-500">Decimal odds — the lower number is the side the market currently favors.</p>

        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 transition-colors duration-500 ${chartReadout.severity.cardClass}`}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/20">
              {(chartReadout.severity.tier === "Sharp move" || chartReadout.severity.tier === "Momentum") && (
                <span
                  className={`absolute inline-flex h-full w-full rounded-lg opacity-20 motion-safe:animate-ping ${chartReadout.severity.dotClass}`}
                />
              )}
              {chartReadout.severity.tier === "Sharp move" || chartReadout.severity.tier === "Momentum" ? (
                <TrendingDown className={`relative h-4 w-4 ${chartReadout.severity.textClass}`} />
              ) : chartReadout.severity.tier === "Building" ? (
                <TrendingUp className={`relative h-4 w-4 ${chartReadout.severity.textClass}`} />
              ) : (
                <Activity className={`relative h-4 w-4 ${chartReadout.severity.textClass}`} />
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Market verdict</p>
              <h3 className="mt-0.5 text-base font-bold leading-tight text-white">{chartReadout.verdict}</h3>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${chartReadout.severity.badgeClass}`}
          >
            {chartReadout.severity.tier}
          </span>
        </div>

        <p className="px-1 text-[11px] leading-5 text-stone-400">
          {chartReadout.meaning}{" "}
          {chartReadout.signalStatus !== "No signal marker on this chart yet" ? `• ${chartReadout.signalStatus}` : ""}
        </p>
      </div>

      <div className="mb-2 flex items-end justify-between px-1">
        <div>
          <h3 className="text-xs font-semibold text-white">Odds movement over time</h3>
          <p className="text-[10px] text-stone-500">
            Each point is a real TxLINE odds update, not a match minute. The line going down means the market favors that side more.
          </p>
        </div>
      </div>
      <div className="h-[320px] w-full rounded-lg bg-black/18 p-2 sm:h-[360px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 18, left: 0, bottom: 4 }}>
              <defs>
                {/* Pixel/halftone fill instead of a smooth gradient - each Area's
                    fill is a repeating small-square tile clipped to the area
                    shape, same technique a bar chart would use for a "pixel
                    bar" look, adapted here since our data is a continuous
                    line, not discrete bars. */}
                <pattern id="lmPixelHome" width="8" height="8" patternUnits="userSpaceOnUse">
                  <rect width="8" height="8" fill="transparent" />
                  <rect width="4" height="4" fill="#ffb020" fillOpacity={0.65} />
                </pattern>
                <pattern id="lmPixelAway" width="8" height="8" patternUnits="userSpaceOnUse">
                  <rect width="8" height="8" fill="transparent" />
                  <rect width="4" height="4" fill="#2fd6b4" fillOpacity={0.45} />
                </pattern>
              </defs>

              <CartesianGrid stroke="rgba(158,196,224,0.3)" strokeDasharray="1 7" strokeLinecap="round" />

              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#a8a29e", fontSize: 10 }} />

              <YAxis
                orientation="right"
                axisLine={false}
                tickLine={false}
                width={42}
                tick={{ fill: "#a8a29e", fontSize: 10 }}
                tickFormatter={(value) => Number(value).toFixed(2)}
                domain={["dataMin - 0.05", "dataMax + 0.05"]}
                label={{ value: "Odds ↓ = favorite", angle: -90, position: "insideRight", fill: "#78716c", fontSize: 9, dx: 14 }}
              />

              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1, strokeDasharray: "4 4" }}
                wrapperStyle={{ zIndex: 50 }}
                content={(tooltipProps) => {
                  const payload = tooltipProps.payload ?? [];
                  const point = payload[0]?.payload;
                  const marker = chartSignalMarkers.find((currentMarker) => currentMarker.x === tooltipProps.label);

                  if (!point) return null;

                  return (
                    <div className="w-[240px] rounded-lg border border-border bg-surface-1/95 p-3 text-xs text-stone-100 shadow-2xl shadow-black/50">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-info-200/70">
                            {point.snapshotLabel ?? "TxLINE snapshot"}
                          </p>
                          <p className="mt-1 text-[11px] text-stone-400">{point.timelineLabel ?? "Odds history point"}</p>
                        </div>
                        {marker && (
                          <span className="rounded-md bg-accent/15 px-2 py-1 text-[10px] font-semibold text-accent-100">
                            Signal
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid gap-1.5">
                        <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                          <span className="text-stone-400">{selectedMatch?.homeTeam ?? "Home"}</span>
                          <span className="font-mono font-semibold text-accent-200">{formatOdds(point.home)}</span>
                        </div>
                        <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                          <span className="text-stone-400">{selectedMatch?.awayTeam ?? "Away"}</span>
                          <span className="font-mono font-semibold text-positive-200">{formatOdds(point.away)}</span>
                        </div>
                      </div>

                      <p className="mt-2 rounded-lg bg-info/10 px-3 py-2 text-[11px] leading-5 text-info-100">
                        Lower odds = stronger market confidence.
                      </p>

                      {marker && (
                        <div className="mt-2 rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-[11px] leading-5 text-accent-100/90">
                          <p className="font-semibold text-accent-100">{marker.label}</p>
                          <p>Target: {marker.target ?? "Tracked side"}</p>
                          <p>
                            Odds: {formatOdds(marker.oddsBefore)} → {formatOdds(marker.oddsAfter)}
                          </p>
                          <p>Move: {formatOddsChange(marker.oddsChangePct)}</p>
                          <p>Confidence: {marker.confidenceScore != null ? `${marker.confidenceScore}%` : "—"}</p>
                          <p>Field pressure: {marker.fieldPressureScore != null ? marker.fieldPressureScore : "—"}</p>
                          {marker.explanation && <p className="mt-1 text-accent-100/80">{marker.explanation}</p>}
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              <Area
                type="monotone"
                dataKey="home"
                stroke="#ffb020"
                strokeWidth={2.8}
                fill="url(#lmPixelHome)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={650}
                animationEasing="ease-out"
                name="Primary tracked odds"
              />
              <Area
                type="monotone"
                dataKey="away"
                stroke="#2fd6b4"
                strokeWidth={2}
                fill="url(#lmPixelAway)"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={true}
                animationDuration={650}
                animationEasing="ease-out"
                name="Away odds"
              />
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
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg bg-black/25 text-sm text-stone-500">
            Select a market or start demo replay to load TxLINE snapshots
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-accent to-positive transition-all duration-700 ease-out"
              style={{ width: isReplayStreamMode ? `${streamProgressPercent}%` : isOddsStreamLive ? "100%" : "8%" }}
            />
          </div>
          <span className="shrink-0 text-[10px] text-stone-500">
            {isReplayStreamMode
              ? replayStreamProgress || "Demo replay ready"
              : isOddsStreamLive
                ? "Data stream active"
                : "Data stream connecting"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2 text-[10px] text-stone-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            {selectedMatch?.homeTeam ?? "Home"} odds
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-positive" />
            {selectedMatch?.awayTeam ?? "Away"} odds
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-accent-100 bg-danger" />
            High severity
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-accent-100 bg-warning" />
            Medium severity
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-accent-100 bg-stone-400" />
            Low severity
          </span>
        </div>
      </div>
    </Card>
  );
}
