import { Card } from "../../components/ui/Card";
import { matchClockLabel, preciseStatusLabel } from "../../lib/formatters";
import type { Match } from "../../types";
import type { LiveMarketsMarketPressure } from "./LiveMarketsPage";

export interface SelectedMatchPanelProps {
  selectedMatch?: Match;
  selectedMatchMarketPressure: LiveMarketsMarketPressure;
}

/**
 * Match command header - a compact scoreboard, not a KPI grid. Gold is used
 * as an accent (the top rail, the home side) rather than as a full-card
 * fill, so it reads as a command-console readout instead of a promo banner.
 * Home = amber, away = teal, matching the odds chart's own color coding
 * below so the two panels stay legible as "the same match" at a glance.
 */
export function SelectedMatchPanel({ selectedMatch, selectedMatchMarketPressure }: SelectedMatchPanelProps) {
  const isLive = selectedMatch?.status === "live";
  const isScheduled = selectedMatch?.status === "scheduled";

  return (
    <Card id="guide-selected-match" className="relative overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-accent/40 to-transparent" aria-hidden="true" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-stone-500">Selected match</p>
          <h2 className="mt-0.5 font-display text-lg font-bold leading-tight tracking-tight text-white">
            {selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "No match yet"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md border border-border bg-black/25 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-300">
            {isLive && <span className="h-1.5 w-1.5 rounded-full bg-positive motion-safe:animate-pulse" aria-hidden="true" />}
            {isLive ? "Clock" : "Timing"} {matchClockLabel(selectedMatch)}
          </span>
          <span
            className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${
              isLive
                ? "border-positive/30 bg-positive/10 text-positive-200"
                : isScheduled
                  ? "border-info/30 bg-info/10 text-info-200"
                  : "border-border bg-black/25 text-stone-300"
            }`}
          >
            {preciseStatusLabel(selectedMatch)}
          </span>
        </div>
      </div>

      {/* The scoreboard is the actual hero here - a match-odds app's most
          characteristic artifact is the score itself, not a KPI grid. */}
      <div className="mt-4 flex items-center justify-center gap-4 sm:gap-8">
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-sm font-medium text-accent-200">{selectedMatch?.homeTeam ?? "Home"}</p>
          <p className="font-display text-3xl font-black tabular-nums text-white sm:text-4xl">
            {isScheduled ? "—" : selectedMatch?.homeScore ?? 0}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">vs</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-positive-200">{selectedMatch?.awayTeam ?? "Away"}</p>
          <p className="font-display text-3xl font-black tabular-nums text-white sm:text-4xl">
            {isScheduled ? "—" : selectedMatch?.awayScore ?? 0}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-stone-500">Market pressure</p>
            <p className="text-sm font-semibold text-white">{selectedMatchMarketPressure.leader}</p>
          </div>
          {selectedMatchMarketPressure.hasData && (
            <p className="text-[11px] text-stone-500">Signal pressure heuristic</p>
          )}
        </div>

        {selectedMatchMarketPressure.hasData ? (
          <div className="space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-stone-400">
                <span>{selectedMatch?.homeTeam ?? "Home"}</span>
                <span className="font-mono tabular-nums">{selectedMatchMarketPressure.homePressure}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/8">
                <div
                  className="h-1.5 rounded-full bg-accent"
                  style={{ width: `${selectedMatchMarketPressure.homePressure}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-stone-400">
                <span>{selectedMatch?.awayTeam ?? "Away"}</span>
                <span className="font-mono tabular-nums">{selectedMatchMarketPressure.awayPressure}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/8">
                <div
                  className="h-1.5 rounded-full bg-positive"
                  style={{ width: `${selectedMatchMarketPressure.awayPressure}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-stone-500">No signal pressure data yet</p>
        )}
      </div>
    </Card>
  );
}
