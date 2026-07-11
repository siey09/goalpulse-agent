import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp, Activity } from "lucide-react";
import { Card } from "../../components/ui/Card";
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
}: LiveMarketsPageProps) {
  return (
    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
      <Card id="guide-selected-match" className="overflow-hidden border-0 bg-gradient-to-br from-orange-400 to-[#2a1810] p-4 text-white 2xl:col-span-2">
        <p className="text-sm text-orange-50/80">Selected match</p>
        <h2 className="mt-1 text-xl font-semibold leading-tight">
          {selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "No match yet"}
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-[#17100c]/80 p-3">
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
            <div className="rounded-xl bg-white/15 p-2.5">
              <p className="text-xs text-white/70">{selectedMatch?.status === "live" ? "Clock" : "Timing"}</p>
              <p className="text-xl font-semibold">{matchClockLabel(selectedMatch)}</p>
            </div>
            <div className="rounded-xl bg-white/15 p-2.5">
              <p className="text-xs text-white/70">Status</p>
              <p className="text-sm font-semibold">{preciseStatusLabel(selectedMatch)}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#17100c]/75 p-3">
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
                    className="h-2 rounded-full bg-orange-200"
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
                    className="h-2 rounded-full bg-emerald-300"
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
              <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-300">
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
              <span className="mb-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
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

          <div className="max-w-[260px] rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Timeline view</p>
            <p className="mt-1 text-xs font-semibold text-white">Last {chartData.length} TxLINE snapshots</p>
            <p className="mt-1 text-[10px] leading-4 text-stone-500">
              S1-S{chartData.length} are odds captures, not match minutes.
            </p>
            <p
              className={`mt-2 text-[10px] font-semibold ${
                isReplayStreamMode ? "text-sky-200" : isOddsStreamLive ? "text-emerald-200" : "text-amber-200"
              }`}
            >
              {isReplayStreamMode ? "DEMO REPLAY STREAM" : isOddsStreamLive ? "DATA STREAM ACTIVE" : "CONNECTING DATA STREAM"}
            </p>
            {oddsStreamLastUpdate && <p className="mt-1 text-[10px] text-stone-500">Last tick: {oddsStreamLastUpdate}</p>}
            {health?.liveStream && (
              <p
                className={`mt-2 text-[10px] font-semibold ${
                  health.liveStream.connected ? "text-emerald-200" : "text-stone-500"
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
                  ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
                  : "border-white/10 bg-white/5 text-stone-300 hover:border-white/20"
              }`}
            >
              {isReplayStreamMode ? "Stop demo replay" : "Start demo replay"}
            </button>
            {isReplayStreamMode && (
              <p className="mt-2 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-[10px] leading-4 text-sky-100">
                {replayStreamProgress || "Demo replay using saved real TxLINE snapshots"}
              </p>
            )}
          </div>
        </div>

        <div className="mb-3 space-y-2">
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-500 ${chartReadout.severity.cardClass}`}>
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
            <div className="rounded-2xl border border-orange-400/15 bg-gradient-to-br from-orange-400/10 to-black/30 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{selectedMatch?.homeTeam ?? "Home"} odds now</p>
              <p className="mt-2 text-2xl font-bold text-orange-200">{chartReadout.homeCurrent}</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/15 bg-gradient-to-br from-emerald-400/10 to-black/30 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{selectedMatch?.awayTeam ?? "Away"} odds now</p>
              <p className="mt-2 text-2xl font-bold text-emerald-200">{chartReadout.awayCurrent}</p>
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
        <div className="h-[285px] w-full rounded-[22px] bg-black/18 p-2">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 18, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="lmReferenceHome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c" stopOpacity={0.78} />
                    <stop offset="45%" stopColor="#fb923c" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#fb923c" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="lmReferenceAway" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 9" vertical={false} />

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
                  cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
                  wrapperStyle={{ zIndex: 50 }}
                  content={(tooltipProps) => {
                    const payload = tooltipProps.payload ?? [];
                    const point = payload[0]?.payload;
                    const marker = chartSignalMarkers.find((currentMarker) => currentMarker.x === tooltipProps.label);

                    if (!point) return null;

                    return (
                      <div className="w-[240px] rounded-2xl border border-white/10 bg-[#11100f]/95 p-3 text-xs text-stone-100 shadow-2xl shadow-black/50">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-sky-200/70">
                              {point.snapshotLabel ?? "TxLINE snapshot"}
                            </p>
                            <p className="mt-1 text-[11px] text-stone-400">{point.timelineLabel ?? "Odds history point"}</p>
                          </div>
                          {marker && (
                            <span className="rounded-full bg-orange-400/15 px-2 py-1 text-[10px] font-semibold text-orange-100">
                              Signal
                            </span>
                          )}
                        </div>

                        <div className="mt-3 grid gap-1.5">
                          <div className="flex justify-between rounded-xl bg-white/5 px-3 py-2">
                            <span className="text-stone-400">{selectedMatch?.homeTeam ?? "Home"}</span>
                            <span className="font-semibold text-orange-200">{formatOdds(point.home)}</span>
                          </div>
                          <div className="flex justify-between rounded-xl bg-white/5 px-3 py-2">
                            <span className="text-stone-400">{selectedMatch?.awayTeam ?? "Away"}</span>
                            <span className="font-semibold text-emerald-200">{formatOdds(point.away)}</span>
                          </div>
                        </div>

                        <p className="mt-2 rounded-xl bg-sky-400/10 px-3 py-2 text-[11px] leading-5 text-sky-100">
                          Lower odds = stronger market confidence.
                        </p>

                        {marker && (
                          <div className="mt-2 rounded-xl border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-[11px] leading-5 text-orange-50/90">
                            <p className="font-semibold text-orange-100">{marker.label}</p>
                            <p>Target: {marker.target ?? "Tracked side"}</p>
                            <p>
                              Odds: {formatOdds(marker.oddsBefore)} → {formatOdds(marker.oddsAfter)}
                            </p>
                            <p>Move: {formatOddsChange(marker.oddsChangePct)}</p>
                            <p>Confidence: {marker.confidenceScore != null ? `${marker.confidenceScore}%` : "—"}</p>
                            <p>Field pressure: {marker.fieldPressureScore != null ? marker.fieldPressureScore : "—"}</p>
                            {marker.explanation && <p className="mt-1 text-orange-50/80">{marker.explanation}</p>}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="home"
                  stroke="#fb923c"
                  strokeWidth={2.8}
                  fill="url(#lmReferenceHome)"
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
                  stroke="#34d399"
                  strokeWidth={2}
                  fill="url(#lmReferenceAway)"
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
                      stroke="#fff7ed"
                      strokeWidth={2}
                      fill={markerStyle.fill}
                      label={{ value: "Signal", position: "top", fill: "#fed7aa", fontSize: 10 }}
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
                className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-emerald-400 transition-all duration-700 ease-out"
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
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                {selectedMatch?.homeTeam ?? "Home"} odds
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {selectedMatch?.awayTeam ?? "Away"} odds
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-orange-100 bg-[#f87171]" />
                High severity
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-orange-100 bg-[#fbbf24]" />
                Medium severity
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-orange-100 bg-[#94a3b8]" />
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
            <h2 className="text-xl font-semibold">Market board</h2>
          </div>
        </div>

        <p className="mb-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] leading-5 text-stone-400">
          Odds shown here are market prices, not match scores. Upcoming matches show pre-match odds before kickoff.
        </p>

        <div className="mb-3 grid grid-cols-4 gap-1.5 rounded-2xl bg-black/20 p-1">
          {(["all", "live", "scheduled", "finished"] as const).map((status) => (
            <button
              key={status}
              onClick={() => onChangeMatchStatusFilter(status)}
              className={`rounded-xl px-2 py-2 text-[10px] font-semibold transition ${
                matchStatusFilter === status
                  ? "bg-orange-400/15 text-orange-200"
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
            <div className="rounded-2xl bg-black/25 p-4 text-sm text-stone-500">No matches found</div>
          )}
          {matches.map((match) => {
            const odds = getOdds(match);

            return (
              <button
                key={match.id}
                onClick={() => onSelectMatch(match.id)}
                className={`w-full rounded-xl border p-2.5 text-left transition ${
                  selectedMatchId === match.id
                    ? "border-orange-400/30 bg-orange-400/10"
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

                <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                  <div className="rounded-lg bg-black/25 px-2 py-1.5">
                    <p className="text-stone-500">{match.status === "scheduled" ? "Pre-match Home" : "Home"}</p>
                    <p className="font-semibold text-orange-200">{formatOdds(odds.homeOdds)}</p>
                  </div>
                  <div className="rounded-lg bg-black/25 px-2 py-1.5">
                    <p className="text-stone-500">{match.status === "scheduled" ? "Pre-match Draw" : "Draw"}</p>
                    <p className="font-semibold text-stone-200">{formatOdds(odds.drawOdds)}</p>
                  </div>
                  <div className="rounded-lg bg-black/25 px-2 py-1.5">
                    <p className="text-stone-500">{match.status === "scheduled" ? "Pre-match Away" : "Away"}</p>
                    <p className="font-semibold text-emerald-200">{formatOdds(odds.awayOdds)}</p>
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
