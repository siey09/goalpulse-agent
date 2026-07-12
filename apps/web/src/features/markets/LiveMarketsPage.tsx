import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp, Activity } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { StatusCapsule } from "../../components/ui/widgets/StatusCapsule";
import {
  formatOdds,
  formatOddsChange,
  severityMarkerStyle,
  getOdds,
  matchStatusTone,
  preciseStatusLabel,
  matchClockLabel,
  dataFreshnessLabel,
} from "../../lib/formatters";
import type { Match, Health } from "../../types";

export interface LiveMarketsChartPoint {
  name: string;
  home?: number;
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

  matches: Match[];
  matchStatusFilter?: string;
  onChangeMatchStatusFilter: (status: "all" | "live" | "scheduled" | "finished") => void;
  matchStatusCounts: { all: number; live: number; scheduled: number; finished: number };
  selectedMatchId: string;
  onSelectMatch: (matchId: string) => void;
  onSelectSignalId: (signalId: string) => void;
}

/**
 * The real per-fixture Market Pulse chart and Market Board, extracted
 * from App.tsx's "overview"/"markets" sections. Full fidelity with the
 * original: signal markers, custom tooltip, gradients - not a
 * simplified stand-in like Command Center's own chart.
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
  matches,
  matchStatusFilter,
  onChangeMatchStatusFilter,
  matchStatusCounts,
  selectedMatchId,
  onSelectMatch,
  onSelectSignalId,
}: LiveMarketsPageProps) {
  return (
    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
      <Card id="guide-selected-match" className="overflow-hidden border-0 bg-gradient-to-br from-accent to-canvas p-4 text-white 2xl:col-span-2">
        <p className="text-sm text-accent-100/80">Selected match</p>
        <h2 className="mt-1 font-display text-xl font-bold leading-tight tracking-tight">
          {selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "No match yet"}
        </h2>

        {/* Row height is always driven by the tallest column (Market Pressure,
            with two progress-bar rows) regardless of align-items - that's how
            CSS grid tracks work. items-start alone left Score and
            Timing/Status floating with visible empty space below them. The
            actual fix: let the row stretch (default) but center each
            column's own content vertically within it, so the extra height
            reads as intentional breathing room instead of a leftover gap. */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex h-full flex-col justify-center rounded-xl bg-black/25 p-3">
            <div className="flex items-center justify-between text-sm text-stone-300">
              <span>{selectedMatch?.homeTeam ?? "Home"}</span>
              <span className="text-xl font-semibold text-white">
                {selectedMatch?.status === "scheduled" ? "—" : selectedMatch?.homeScore ?? 0}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-stone-300">
              <span>{selectedMatch?.awayTeam ?? "Away"}</span>
              <span className="text-xl font-semibold text-white">
                {selectedMatch?.status === "scheduled" ? "—" : selectedMatch?.awayScore ?? 0}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatusCapsule
              label={selectedMatch?.status === "live" ? "Clock" : "Timing"}
              value={matchClockLabel(selectedMatch)}
              tone="neutral"
              pulse={selectedMatch?.status === "live"}
            />
            <StatusCapsule label="Status" value={preciseStatusLabel(selectedMatch)} tone="neutral" />
          </div>

          <div className="flex h-full flex-col justify-center rounded-xl bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-white/60">Market pressure</p>
                <p className="text-sm font-semibold text-white">{selectedMatchMarketPressure.leader}</p>
              </div>
              <p className="text-[11px] text-white/60">Momentum weighted</p>
            </div>

            <div className="space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-white/70">
                  <span>{selectedMatch?.homeTeam ?? "Home"}</span>
                  <span>{selectedMatchMarketPressure.homePressure}</span>
                </div>
                <div className="h-2 rounded-full bg-white/15">
                  <div
                    className="h-2 rounded-full bg-accent-200"
                    style={{ width: `${selectedMatchMarketPressure.homePressure}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-white/70">
                  <span>{selectedMatch?.awayTeam ?? "Away"}</span>
                  <span>{selectedMatchMarketPressure.awayPressure}</span>
                </div>
                <div className="h-2 rounded-full bg-white/15">
                  <div
                    className="h-2 rounded-full bg-positive-300"
                    style={{ width: `${selectedMatchMarketPressure.awayPressure}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card id="guide-odds-chart" className="overflow-hidden p-4 2xl:col-span-2">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-stone-400">Selected market</p>
              <span className="rounded-full border border-border bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-300">
                {isReplayStreamMode
                  ? "Demo replay"
                  : selectedMatch?.status === "scheduled"
                    ? "Pre-match odds"
                    : selectedMatch?.status === "live"
                      ? "Live odds"
                      : selectedMatch?.status === "finished"
                        ? "Finished audit"
                        : "Waiting"}
              </span>
            </div>
            <div className="mt-1 flex items-end gap-3">
              <p className="text-3xl font-semibold tracking-tight text-white">
                {formatOdds(chartData[chartData.length - 1]?.home)}
              </p>
              <span className="mb-1 rounded-full bg-positive/10 px-2.5 py-1 text-xs font-medium text-positive-300">
                {isReplayStreamMode
                  ? "Demo replay tracked odds"
                  : selectedMatch?.status === "scheduled"
                    ? "Pre-match tracked odds"
                    : selectedMatch?.status === "live"
                      ? "Live tracked odds"
                      : selectedMatch?.status === "finished"
                        ? "Finished audit tracked odds"
                        : "Primary tracked odds"}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "Waiting for match selection"}
            </p>
            <p className="mt-2 max-w-md text-[11px] leading-5 text-stone-500">
              Lower odds usually mean stronger market confidence. GoalPulse explains movement for analytics only.
            </p>
          </div>

          <div className="max-w-[260px] rounded-xl border border-border bg-black/25 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Timeline view</p>
            <p className="mt-1 text-xs font-semibold text-white">Last {chartData.length} TxLINE snapshots</p>
            <p className="mt-1 text-[10px] leading-4 text-stone-500">
              S1-S{chartData.length} are odds captures, not match minutes.
            </p>
            <p
              className={`mt-2 text-[10px] font-semibold ${
                isReplayStreamMode ? "text-info-200" : isOddsStreamLive ? "text-positive-200" : "text-warning-200"
              }`}
            >
              {isReplayStreamMode ? "DEMO REPLAY STREAM" : isOddsStreamLive ? "DATA STREAM ACTIVE" : "CONNECTING DATA STREAM"}
            </p>
            {oddsStreamLastUpdate && <p className="mt-1 text-[10px] text-stone-500">Last tick: {oddsStreamLastUpdate}</p>}
            {health?.liveStream && (
              <p
                className={`mt-2 text-[10px] font-semibold ${
                  health.liveStream.connected ? "text-positive-200" : "text-stone-500"
                }`}
                title={health.liveStream.lastError ?? undefined}
              >
                {health.liveStream.connected
                  ? `⛓ TxLINE push feed connected (${health.liveStream.totalEventsReceived ?? 0} events)`
                  : "⛓ TxLINE push feed reconnecting…"}
              </p>
            )}
            <button
              type="button"
              onClick={onToggleReplayStreamMode}
              className={`mt-3 w-full rounded-xl border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                isReplayStreamMode
                  ? "border-info/40 bg-info-500/15 text-info-100"
                  : "border-border bg-white/5 text-stone-300 hover:border-white/20"
              }`}
            >
              {isReplayStreamMode ? "Stop demo replay" : "Start demo replay"}
            </button>
            {isReplayStreamMode && (
              <p className="mt-2 rounded-xl border border-info/20 bg-info-500/10 px-3 py-2 text-[10px] leading-4 text-info-100">
                {replayStreamProgress || "Demo replay using saved real TxLINE snapshots"}
              </p>
            )}
          </div>
        </div>

        <div className="mb-3 space-y-2">
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 transition-all duration-500 ${chartReadout.severity.cardClass}`}>
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/20">
                {(chartReadout.severity.tier === "Sharp move" || chartReadout.severity.tier === "Momentum") && (
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-xl opacity-20 ${chartReadout.severity.dotClass}`} />
                )}
                {chartReadout.severity.tier === "Sharp move" || chartReadout.severity.tier === "Momentum" ? (
                  <TrendingDown className={`relative h-5 w-5 ${chartReadout.severity.textClass}`} />
                ) : chartReadout.severity.tier === "Building" ? (
                  <TrendingUp className={`relative h-5 w-5 ${chartReadout.severity.textClass}`} />
                ) : (
                  <Activity className={`relative h-5 w-5 ${chartReadout.severity.textClass}`} />
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">Market verdict</p>
                <h3 className="mt-0.5 text-lg font-bold leading-tight text-white">{chartReadout.verdict}</h3>
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${chartReadout.severity.badgeClass}`}>
              {chartReadout.severity.tier}
            </span>
          </div>

          <p className="px-1 text-[11px] leading-5 text-stone-400">
            {chartReadout.meaning}{" "}
            {chartReadout.signalStatus !== "No signal marker on this chart yet" ? `• ${chartReadout.signalStatus}` : ""}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-accent/10 to-black/30 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{selectedMatch?.homeTeam ?? "Home"} odds now</p>
              <p className="mt-2 text-2xl font-bold text-accent-200">{chartReadout.homeCurrent}</p>
            </div>
            <div className="rounded-xl border border-positive/15 bg-gradient-to-br from-positive/10 to-black/30 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{selectedMatch?.awayTeam ?? "Away"} odds now</p>
              <p className="mt-2 text-2xl font-bold text-positive-200">{chartReadout.awayCurrent}</p>
            </div>
          </div>
          <p className="px-1 text-[10px] text-stone-500">Decimal odds — the lower number is the side the market currently favors.</p>
        </div>

        <div className="mb-2 flex items-end justify-between px-1">
          <div>
            <p className="text-xs font-semibold text-white">Odds movement over time</p>
            <p className="text-[10px] text-stone-500">
              Each point is a real TxLINE odds update, not a match minute. The line going down means the market favors that side more.
            </p>
          </div>
        </div>
        <div className="h-[285px] w-full rounded-xl bg-black/18 p-2">
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
                      <div className="w-[240px] rounded-xl border border-border bg-surface-1/95 p-3 text-xs text-stone-100 shadow-2xl shadow-black/50">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-info-200/70">
                              {point.snapshotLabel ?? "TxLINE snapshot"}
                            </p>
                            <p className="mt-1 text-[11px] text-stone-400">{point.timelineLabel ?? "Odds history point"}</p>
                          </div>
                          {marker && (
                            <span className="rounded-full bg-accent/15 px-2 py-1 text-[10px] font-semibold text-accent-100">
                              Signal
                            </span>
                          )}
                        </div>

                        <div className="mt-3 grid gap-1.5">
                          <div className="flex justify-between rounded-xl bg-white/5 px-3 py-2">
                            <span className="text-stone-400">{selectedMatch?.homeTeam ?? "Home"}</span>
                            <span className="font-semibold text-accent-200">{formatOdds(point.home)}</span>
                          </div>
                          <div className="flex justify-between rounded-xl bg-white/5 px-3 py-2">
                            <span className="text-stone-400">{selectedMatch?.awayTeam ?? "Away"}</span>
                            <span className="font-semibold text-positive-200">{formatOdds(point.away)}</span>
                          </div>
                        </div>

                        <p className="mt-2 rounded-xl bg-info/10 px-3 py-2 text-[11px] leading-5 text-info-100">
                          Lower odds = stronger market confidence.
                        </p>

                        {marker && (
                          <div className="mt-2 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-[11px] leading-5 text-accent-100/90">
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
            <div className="flex h-full items-center justify-center rounded-3xl bg-black/25 text-sm text-stone-500">
              Select a market or start demo replay to load TxLINE snapshots
            </div>
          )}
        </div>

        <div className="mt-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-accent to-positive transition-all duration-700 ease-out"
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

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-xl bg-black/15 px-3 py-2 text-[10px] text-stone-400">
            <div className="flex flex-wrap items-center gap-3">
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
            <span className="text-stone-500">
              Outcome audit so far: {correctSignals} confirmed, {closedSignals} closed
            </span>
          </div>
        </div>
      </Card>

      <Card id="guide-market-board" className="p-4 2xl:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">Market feed</p>
            <h2 className="font-display text-xl font-bold tracking-tight">Market board</h2>
          </div>
        </div>

        <p className="mb-3 rounded-xl border border-border bg-black/25 px-3 py-2 text-[11px] leading-5 text-stone-400">
          Odds shown here are market prices, not match scores. Upcoming matches show pre-match odds before kickoff.
        </p>

        <div className="mb-3 grid grid-cols-4 gap-1.5 rounded-xl bg-black/20 p-1">
          {(["all", "live", "scheduled", "finished"] as const).map((status) => (
            <button
              key={status}
              onClick={() => onChangeMatchStatusFilter(status)}
              className={`rounded-xl px-2 py-2 text-[10px] font-semibold transition ${
                matchStatusFilter === status
                  ? "bg-accent/15 text-accent-200"
                  : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
              }`}
            >
              <span>
                {status === "all" ? "All" : status === "scheduled" ? "Upcoming" : status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              <span className="ml-1 opacity-70">{matchStatusCounts[status]}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {matches.length === 0 && (
            <div className="rounded-xl bg-black/25 p-4 text-sm text-stone-500">No matches found</div>
          )}
          {matches.map((match) => {
            const odds = getOdds(match);

            return (
              <button
                key={match.id}
                onClick={() => onSelectMatch(match.id)}
                className={`w-full rounded-xl border p-2.5 text-left transition ${
                  selectedMatchId === match.id
                    ? "border-accent/30 bg-accent/10"
                    : "border-white/8 bg-black/20 hover:bg-white/6"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${matchStatusTone(match)}`}>
                    {preciseStatusLabel(match)}
                  </span>
                  <span className="text-right text-xs text-stone-500">
                    <span className="block">{matchClockLabel(match)}</span>
                    {dataFreshnessLabel(match.lastUpdated) && (
                      <span className="block text-[9px] text-stone-600">{dataFreshnessLabel(match.lastUpdated)}</span>
                    )}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">{match.homeTeam}</p>
                    <p className="text-sm font-medium text-white">{match.awayTeam}</p>
                  </div>
                  <div className="space-y-1 text-right text-lg font-semibold">
                    <p>{match.status === "scheduled" ? "—" : match.homeScore ?? 0}</p>
                    <p>{match.status === "scheduled" ? "—" : match.awayScore ?? 0}</p>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">
                      {match.status === "scheduled" ? "Pre-match Home" : "Home"}
                    </p>
                    <p className="font-mono text-sm font-bold tabular-nums text-accent-200">{formatOdds(odds.homeOdds)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">
                      {match.status === "scheduled" ? "Pre-match Draw" : "Draw"}
                    </p>
                    <p className="font-mono text-sm font-bold tabular-nums text-stone-200">{formatOdds(odds.drawOdds)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">
                      {match.status === "scheduled" ? "Pre-match Away" : "Away"}
                    </p>
                    <p className="font-mono text-sm font-bold tabular-nums text-positive-200">{formatOdds(odds.awayOdds)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
