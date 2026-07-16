import { ArrowDown, ArrowUp } from "lucide-react";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { matchClockLabel, preciseStatusLabel } from "../../lib/formatters";
import type { Match } from "../../types";
import type { LiveMarketsChartPoint, LiveMarketsChartReadout, LiveMarketsMarketPressure } from "./LiveMarketsPage";

export interface SelectedMarketWorkspaceProps {
  selectedMatch?: Match;
  chartData: LiveMarketsChartPoint[];
  chartReadout: LiveMarketsChartReadout;
  selectedMatchMarketPressure: LiveMarketsMarketPressure;
  isReplayStreamMode: boolean;
}

type TickDirection = "up" | "down" | "flat" | null;

function tickDirection(chartData: LiveMarketsChartPoint[], key: "home" | "draw" | "away"): TickDirection {
  const current = chartData.at(-1)?.[key];
  const previous = chartData.at(-2)?.[key];
  if (current == null || previous == null) return null;
  if (current < previous) return "down";
  if (current > previous) return "up";
  return "flat";
}

function TickIndicator({ direction }: { direction: TickDirection }) {
  if (!direction || direction === "flat") return null;
  const Icon = direction === "down" ? ArrowDown : ArrowUp;
  const label = direction === "down" ? "shortened since previous tick" : "lengthened since previous tick";

  return (
    <span className="inline-flex items-center text-stone-500" title={label}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function PriceCell({ label, value, tone, direction }: { label: string; value: string; tone: string; direction: TickDirection }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="truncate text-[10px] uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <div className="mt-1 flex items-center gap-1">
        <span className={`font-mono text-lg font-bold tabular-nums sm:text-xl ${tone}`}>{value}</span>
        <TickIndicator direction={direction} />
      </div>
    </div>
  );
}

function MarketPressure({ pressure, selectedMatch }: { pressure: LiveMarketsMarketPressure; selectedMatch?: Match }) {
  if (!pressure.hasData) {
    return <p className="text-xs text-stone-500">Waiting for a selected-match signal before showing pressure.</p>;
  }

  return (
    <div className="min-w-[15rem]">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] text-stone-400">
        <span className="truncate">{selectedMatch?.homeTeam ?? "Home"}</span>
        <span className="font-mono tabular-nums text-stone-300">{pressure.homePressure} / {pressure.awayPressure}</span>
        <span className="truncate text-right">{selectedMatch?.awayTeam ?? "Away"}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/8" aria-label={`Market pressure led by ${pressure.leader}`}>
        <span className="bg-accent" style={{ width: `${pressure.homePressure}%` }} />
        <span className="bg-positive" style={{ width: `${pressure.awayPressure}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-stone-500">Signal pressure · leader {pressure.leader}</p>
    </div>
  );
}

export function SelectedMarketWorkspace({
  selectedMatch,
  chartData,
  chartReadout,
  selectedMatchMarketPressure,
  isReplayStreamMode,
}: SelectedMarketWorkspaceProps) {
  const isLive = selectedMatch?.status === "live";
  const isScheduled = selectedMatch?.status === "scheduled";
  const matchLabel = selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "No match selected";
  const scoreLabel = !selectedMatch
    ? "—"
    : isScheduled
      ? "Scheduled"
      : `${selectedMatch.homeScore ?? 0}–${selectedMatch.awayScore ?? 0}`;
  const marketContextLabel = isReplayStreamMode
    ? "Historical replay"
    : isScheduled
      ? "Pre-match odds"
      : isLive
        ? `Live · ${matchClockLabel(selectedMatch)}`
        : selectedMatch?.status === "finished"
          ? "Finished audit"
          : "Waiting";
  const statusTone: StatusTone = isLive ? "positive" : isScheduled ? "info" : "neutral";
  const priceCells = [
    {
      key: "home" as const,
      label: selectedMatch?.homeTeam ?? "Home",
      value: chartReadout.homeCurrent,
      tone: "text-accent-200",
      direction: tickDirection(chartData, "home"),
    },
    {
      key: "draw" as const,
      label: "Draw",
      value: chartReadout.drawCurrent,
      tone: "text-proof-200",
      direction: tickDirection(chartData, "draw"),
    },
    {
      key: "away" as const,
      label: selectedMatch?.awayTeam ?? "Away",
      value: chartReadout.awayCurrent,
      tone: "text-positive-200",
      direction: tickDirection(chartData, "away"),
    },
  ];

  return (
    <section id="guide-selected-match" role="region" aria-label="Selected market" className="border-b border-border bg-black/15">
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.82fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={preciseStatusLabel(selectedMatch)} tone={statusTone} withDot={isLive} />
            <span className="font-mono text-xs text-stone-400">{marketContextLabel}</span>
          </div>
          <h2 className="mt-2 truncate font-display text-xl font-bold tracking-tight text-white">{matchLabel}</h2>
          <p aria-label="Score" className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">
            {scoreLabel}
          </p>
        </div>

        <div aria-label="Current decimal odds" className="grid grid-cols-3 divide-x divide-border border-y border-border bg-black/15">
          {priceCells.map((cell) => (
            <PriceCell key={cell.key} label={cell.label} value={cell.value} tone={cell.tone} direction={cell.direction} />
          ))}
        </div>
      </div>

      <div className={`grid gap-3 border-t border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${chartReadout.severity.cardClass}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400">Market verdict</p>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${chartReadout.severity.badgeClass}`}>
              {chartReadout.severity.tier}
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">{chartReadout.verdict}</h3>
          <p className="text-xs leading-5 text-stone-300">{chartReadout.meaning}</p>
        </div>
        <MarketPressure pressure={selectedMatchMarketPressure} selectedMatch={selectedMatch} />
      </div>
    </section>
  );
}
