import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { dataFreshnessLabel, matchClockLabel, preciseStatusLabel } from "../../lib/formatters";
import type { Match } from "../../types";

export type MatchStatusFilter = "all" | "live" | "scheduled" | "finished";

export interface MarketFixtureRailProps {
  matches: Match[];
  selectedMatch?: Match;
  matchStatusFilter?: string;
  onChangeMatchStatusFilter: (status: MatchStatusFilter) => void;
  matchStatusCounts: Record<MatchStatusFilter, number>;
  selectedMatchId: string;
  onSelectMatch: (matchId: string) => void;
}

const FILTER_OPTIONS: { value: MatchStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "scheduled", label: "Upcoming" },
  { value: "finished", label: "Finished" },
];

const STATUS_SCAN_ORDER: Record<string, number> = { live: 0, scheduled: 1, finished: 2 };

function matchStatusToTone(match: Match): StatusTone {
  const label = `${match.statusLabel ?? ""}`.toLowerCase();
  if (label.includes("suspended") || label.includes("interrupted")) return "warning";
  if (label.includes("cancelled") || label.includes("abandoned")) return "danger";
  if (match.status === "live") return "positive";
  if (match.status === "scheduled") return "info";
  return "neutral";
}

function emptyFilterLabel(filter: MatchStatusFilter) {
  if (filter === "all") return "fixtures";
  if (filter === "scheduled") return "upcoming fixtures";
  return `${filter} fixtures`;
}

export function MarketFixtureRail({
  matches,
  selectedMatch,
  matchStatusFilter,
  onChangeMatchStatusFilter,
  matchStatusCounts,
  selectedMatchId,
  onSelectMatch,
}: MarketFixtureRailProps) {
  const requestedFilter = matchStatusFilter as MatchStatusFilter | undefined;
  const activeFilter = FILTER_OPTIONS.some((option) => option.value === requestedFilter) ? requestedFilter! : "all";
  const [isDesktopRail, setIsDesktopRail] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? true
      : window.matchMedia("(min-width: 1280px)").matches
  );
  const [isCompactOpen, setIsCompactOpen] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 1280px)");
    const onChange = (event: MediaQueryListEvent) => {
      setIsDesktopRail(event.matches);
      if (event.matches) setIsCompactOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const displayMatches =
    activeFilter === "all"
      ? [...matches].sort((a, b) => (STATUS_SCAN_ORDER[a.status ?? ""] ?? 3) - (STATUS_SCAN_ORDER[b.status ?? ""] ?? 3))
      : matches;

  return (
    <section
      id="guide-market-board"
      role="region"
      aria-label="Fixture rail"
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface-1"
    >
      {!isDesktopRail && (
        <button
          type="button"
          aria-expanded={isCompactOpen}
          aria-controls="fixture-list-panel"
          aria-label={`Change fixture${selectedMatch ? `, ${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : ""}`}
          onClick={() => setIsCompactOpen((current) => !current)}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
        >
          <span className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">Selected fixture</span>
            <span className="block truncate text-sm font-semibold text-white">
              {selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "Browse fixture list"}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-accent-100">{isCompactOpen ? "Close list" : "Change fixture"}</span>
        </button>
      )}

      {(isDesktopRail || isCompactOpen) && <div id="fixture-list-panel">
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500">Market feed</p>
            <h2 className="font-display text-lg font-bold text-white">Fixtures</h2>
          </div>
          <span aria-live="polite" className="font-mono text-xs tabular-nums text-stone-300">
            {displayMatches.length} shown
          </span>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg bg-black/25 p-1" aria-label="Fixture status filter">
          {FILTER_OPTIONS.map((option) => {
            const isActive = option.value === activeFilter;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => onChangeMatchStatusFilter(option.value)}
                className={`min-h-11 min-w-0 rounded-md px-1.5 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                  isActive ? "bg-accent/15 text-accent-100" : "text-stone-500 hover:bg-white/5 hover:text-stone-200"
                }`}
              >
                <span className="block truncate">{option.label}</span>
                <span className="mt-0.5 block font-mono tabular-nums" aria-label={`${matchStatusCounts[option.value]} fixtures`}>
                  {matchStatusCounts[option.value]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {displayMatches.length === 0 ? (
        <div className="p-3">
          <EmptyState
            reason={`No ${emptyFilterLabel(activeFilter)} are available.`}
            action={
              activeFilter !== "all" ? (
                <button
                  type="button"
                  onClick={() => onChangeMatchStatusFilter("all")}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-accent-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  Show all fixtures
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="max-h-[18rem] overflow-y-auto overscroll-contain p-2 md:max-h-[22rem] xl:max-h-[42rem]">
          {displayMatches.map((match) => {
            const isSelected = selectedMatchId === match.id;
            return (
              <button
                key={match.id}
                type="button"
                aria-label={`Inspect market for ${match.homeTeam ?? "home"} vs ${match.awayTeam ?? "away"}`}
                aria-pressed={isSelected}
                onClick={() => {
                  onSelectMatch(match.id);
                  if (!isDesktopRail) setIsCompactOpen(false);
                }}
                className={`group grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-2 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
                  isSelected ? "bg-accent/10" : "hover:bg-white/5"
                }`}
              >
                <StatusBadge label={preciseStatusLabel(match)} tone={matchStatusToTone(match)} withDot={match.status === "live"} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">
                    {match.homeTeam} vs {match.awayTeam}
                  </span>
                  <span className="block truncate text-[10px] text-stone-500">
                    {match.status === "finished" ? "Final result" : dataFreshnessLabel(match.lastUpdated)}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-right font-mono text-xs tabular-nums text-stone-300">
                  <span>
                    <span className="block">
                      {match.status === "scheduled" ? matchClockLabel(match) : `${match.homeScore ?? 0}–${match.awayScore ?? 0}`}
                    </span>
                    {match.status === "live" && match.minute != null && <span className="block text-positive-200">{match.minute}'</span>}
                  </span>
                  <ChevronRight className={`h-4 w-4 ${isSelected ? "text-accent-100" : "text-stone-700 group-hover:text-stone-400"}`} aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      )}
      </div>}
    </section>
  );
}
