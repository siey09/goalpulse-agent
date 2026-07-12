import { ChevronRight } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { SegmentedToggle } from "../../components/ui/SegmentedToggle";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { dataFreshnessLabel, matchClockLabel, preciseStatusLabel } from "../../lib/formatters";
import type { Match } from "../../types";

export type MatchStatusFilter = "all" | "live" | "scheduled" | "finished";

export interface MarketBoardProps {
  matches: Match[];
  matchStatusFilter?: string;
  onChangeMatchStatusFilter: (status: MatchStatusFilter) => void;
  matchStatusCounts: { all: number; live: number; scheduled: number; finished: number };
  selectedMatchId: string;
  onSelectMatch: (matchId: string) => void;
}

const FILTER_OPTIONS: { value: MatchStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "scheduled", label: "Upcoming" },
  { value: "finished", label: "Finished" },
];

/** StatusTone key derived from match status, kept separate from matchStatusTone() (which returns a raw className for the classic dashboard) so both paths reuse the same status logic without changing it. */
function matchStatusToTone(match: Match): StatusTone {
  const label = `${match.statusLabel ?? ""}`.toLowerCase();
  if (label.includes("suspended") || label.includes("interrupted")) return "warning";
  if (label.includes("cancelled") || label.includes("abandoned")) return "danger";
  if (match.status === "live") return "positive";
  if (match.status === "scheduled") return "info";
  if (match.status === "finished") return "neutral";
  return "neutral";
}

const STATUS_SCAN_ORDER: Record<string, number> = { live: 0, scheduled: 1, finished: 2 };

/**
 * Desktop/tablet render a real <table> (horizontally scrollable if the
 * viewport can't fit it); below the sm breakpoint it switches to compact
 * cards. Both consume the same `matches` prop and formatters - no separate
 * data path, so the two views can never drift out of sync with each other.
 *
 * No price columns: the backend Match contract has never carried odds
 * (prices live on OddsSnapshot, fetched separately per selected match), so
 * a per-row Home/Draw/Away column would only ever render "--". The board
 * is built instead around what every row can reliably show - status,
 * teams, score, clock, and freshness.
 */
export function MarketBoard({
  matches,
  matchStatusFilter,
  onChangeMatchStatusFilter,
  matchStatusCounts,
  selectedMatchId,
  onSelectMatch,
}: MarketBoardProps) {
  // Single-status filters are already homogeneous; only the "All" view
  // benefits from grouping live matches to the top for faster scanning.
  const displayMatches =
    !matchStatusFilter || matchStatusFilter === "all"
      ? [...matches].sort((a, b) => (STATUS_SCAN_ORDER[a.status ?? ""] ?? 3) - (STATUS_SCAN_ORDER[b.status ?? ""] ?? 3))
      : matches;

  return (
    <Card id="guide-market-board" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-stone-500">Market feed</p>
          <h2 className="font-display text-xl font-bold tracking-tight text-white">Market board</h2>
        </div>
        <SegmentedToggle
          options={FILTER_OPTIONS.map((option) => ({ ...option, count: matchStatusCounts[option.value] }))}
          value={(matchStatusFilter as MatchStatusFilter) ?? "all"}
          onChange={onChangeMatchStatusFilter}
        />
      </div>

      <p className="mb-3 rounded-lg border border-border bg-black/25 px-3 py-2 text-[11px] leading-5 text-stone-400">
        Select a match to inspect its live prices and odds chart on the left.
      </p>

      {displayMatches.length === 0 ? (
        <EmptyState reason="No matches found for this filter." />
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.1em] text-stone-500">
                  <th scope="col" className="px-2 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Match
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Time
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Score
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Inspect
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayMatches.map((match) => {
                  const isSelected = selectedMatchId === match.id;
                  const isLive = match.status === "live";
                  const isFinished = match.status === "finished";
                  const freshness = dataFreshnessLabel(match.lastUpdated);

                  return (
                    <tr
                      key={match.id}
                      onClick={() => onSelectMatch(match.id)}
                      aria-selected={isSelected}
                      className={`cursor-pointer border-b border-border/60 text-sm transition-colors focus-within:bg-white/6 ${
                        isSelected ? "bg-accent/8" : "hover:bg-white/5"
                      }`}
                    >
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-1.5">
                          {isLive && <span className="h-1.5 w-1.5 rounded-full bg-positive motion-safe:animate-pulse" aria-hidden="true" />}
                          <StatusBadge label={preciseStatusLabel(match)} tone={matchStatusToTone(match)} />
                          {isSelected && <StatusBadge label="Selected" tone="accent" />}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <p className="font-medium text-accent-200">{match.homeTeam}</p>
                        <p className="font-medium text-positive-200">{match.awayTeam}</p>
                      </td>
                      <td className="px-2 py-2.5 text-stone-400">
                        <span className="block font-mono text-xs tabular-nums">
                          {isLive && match.minute != null ? `${match.minute}'` : matchClockLabel(match)}
                        </span>
                        {freshness && <span className="block text-[9px] text-stone-600">{freshness}</span>}
                      </td>
                      <td className={`px-2 py-2.5 text-right font-mono tabular-nums ${isFinished ? "text-base font-bold text-white" : "text-sm text-stone-400"}`}>
                        {match.status === "scheduled" ? "—" : `${match.homeScore ?? 0}–${match.awayScore ?? 0}`}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectMatch(match.id);
                          }}
                          aria-label={`Inspect market for ${match.homeTeam ?? "home"} vs ${match.awayTeam ?? "away"}`}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500 transition hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          Inspect
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: compact cards */}
          <div className="space-y-2 sm:hidden">
            {displayMatches.map((match) => {
              const isSelected = selectedMatchId === match.id;
              const isLive = match.status === "live";
              const freshness = dataFreshnessLabel(match.lastUpdated);

              return (
                <button
                  key={match.id}
                  onClick={() => onSelectMatch(match.id)}
                  aria-pressed={isSelected}
                  className={`w-full rounded-lg border p-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isSelected ? "border-accent/30 bg-accent/10" : "border-white/8 bg-black/20 hover:bg-white/6"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      {isLive && <span className="h-1.5 w-1.5 rounded-full bg-positive motion-safe:animate-pulse" aria-hidden="true" />}
                      <StatusBadge label={preciseStatusLabel(match)} tone={matchStatusToTone(match)} />
                    </span>
                    <span className="text-right text-xs text-stone-500">
                      <span className="block font-mono tabular-nums">
                        {isLive && match.minute != null ? `${match.minute}'` : matchClockLabel(match)}
                      </span>
                      {freshness && <span className="block text-[9px] text-stone-600">{freshness}</span>}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-accent-200">{match.homeTeam}</p>
                      <p className="text-sm font-medium text-positive-200">{match.awayTeam}</p>
                    </div>
                    <div className="space-y-1 text-right font-mono text-lg font-semibold tabular-nums text-white">
                      <p>{match.status === "scheduled" ? "—" : match.homeScore ?? 0}</p>
                      <p>{match.status === "scheduled" ? "—" : match.awayScore ?? 0}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-end gap-1 border-t border-white/8 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                    {isSelected ? "Selected" : "Inspect market"}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
