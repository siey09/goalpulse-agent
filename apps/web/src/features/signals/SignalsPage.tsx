import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { SignalIntelligencePanel } from "../../components/SignalIntelligencePanel";
import { SteamMoveDetectionPanel } from "../../components/SteamMoveDetectionPanel";
import { SignalCorrelationPanel } from "../../components/SignalCorrelationPanel";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import {
  formatOdds,
  formatOddsChange,
  formatTime,
  getSignalOutcome,
  getSignalTarget,
  getSignalType,
  signalTypeLabel,
} from "../../lib/formatters";
import type { AgentSignal } from "../../types";

export interface OutcomeVerificationItem {
  signal: AgentSignal;
  source: string;
  proofHash?: string;
}

export interface SignalsPageProps {
  outcomeVerificationItems: OutcomeVerificationItem[];
  onSelectSignal: (signal: AgentSignal) => void;
}

type SignalFilter = "all" | "high" | "field" | "settled";

const filters: Array<{ value: SignalFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "high", label: "High priority" },
  { value: "field", label: "Field-backed" },
  { value: "settled", label: "Settled" },
];

function signalCountLabel(count: number) {
  return `${count} ${count === 1 ? "signal" : "signals"} shown`;
}

function severityTone(severity?: string) {
  if (severity?.toUpperCase() === "HIGH") {
    return "border-danger/30 bg-danger/10 text-danger-200";
  }

  if (severity?.toUpperCase() === "MEDIUM") {
    return "border-warning/30 bg-warning/10 text-warning-200";
  }

  return "border-white/10 bg-white/5 text-stone-300";
}

export function SignalsPage({ outcomeVerificationItems, onSelectSignal }: SignalsPageProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SignalFilter>("all");

  const highPriorityCount = outcomeVerificationItems.filter(
    ({ signal }) => signal.severity?.toUpperCase() === "HIGH"
  ).length;
  const fieldBackedCount = outcomeVerificationItems.filter(
    ({ signal }) => (signal.evidence?.scoresContext?.fieldPressureScore ?? 0) >= 22
  ).length;
  const proofCount = outcomeVerificationItems.filter(({ proofHash }) => Boolean(proofHash)).length;
  const normalizedSearch = search.trim().toLowerCase();
  const sortedItems = outcomeVerificationItems
    .map((item, index) => ({
      item,
      index,
      timestamp: item.signal.createdAt ? Date.parse(item.signal.createdAt) : Number.NaN,
    }))
    .sort((left, right) => {
      const leftIsValid = Number.isFinite(left.timestamp);
      const rightIsValid = Number.isFinite(right.timestamp);

      if (leftIsValid && rightIsValid) return right.timestamp - left.timestamp || left.index - right.index;
      if (leftIsValid) return -1;
      if (rightIsValid) return 1;
      return left.index - right.index;
    })
    .map(({ item }) => item);
  const visibleItems = sortedItems.filter((item) => {
    const { signal } = item;
    const haystack = `${signal.match ?? ""} ${getSignalTarget(signal)} ${getSignalType(signal)} ${item.source}`
      .replaceAll("_", " ")
      .toLowerCase();
    const matchesSearch = haystack.includes(normalizedSearch);
    const matchesFilter =
      filter === "all" ||
      (filter === "high" && signal.severity?.toUpperCase() === "HIGH") ||
      (filter === "field" && (signal.evidence?.scoresContext?.fieldPressureScore ?? 0) >= 22) ||
      (filter === "settled" && !["", "pending"].includes((signal.resultStatus ?? "pending").toLowerCase()));

    return matchesSearch && matchesFilter;
  });
  const hasFilters = normalizedSearch.length > 0 || filter !== "all";

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
  };

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone-400">Operator workspace</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">Signal Triage</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-400">
            Compare market movement, field context, and proof before opening the full audit trail.
          </p>
        </div>
        <p aria-live="polite" className="font-mono text-xs tabular-nums text-stone-300">
          {signalCountLabel(visibleItems.length)}
        </p>
      </header>

      <section aria-label="Signal summary" className="grid grid-cols-2 border-y border-border bg-surface-2 sm:grid-cols-4">
        {[
          { label: "Visible", value: visibleItems.length, tone: "text-white" },
          { label: "High severity", value: highPriorityCount, tone: "text-danger-200" },
          { label: "Field-backed", value: fieldBackedCount, tone: "text-positive-200" },
          {
            label: "Proof coverage",
            value: `${proofCount}/${outcomeVerificationItems.length}`,
            tone: proofCount > 0 ? "text-proof-200" : "text-stone-300",
          },
        ].map((metric) => (
          <div key={metric.label} className="min-w-0 border-border p-3 odd:border-r sm:border-r sm:last:border-r-0">
            <p className="text-[11px] text-stone-400">{metric.label}</p>
            <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${metric.tone}`}>{metric.value}</p>
          </div>
        ))}
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.38fr)] lg:items-start">
        <Card className="min-w-0 overflow-hidden" role="region" aria-label="Signal queue">
          <div className="border-b border-border p-3 sm:p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Signal queue</h2>
                <p className="mt-0.5 text-xs text-stone-400">Newest evidence records ready for operator review.</p>
              </div>

              <label className="relative block min-w-0 xl:w-72">
                <span className="sr-only">Search signals</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Match, target, type, or source"
                  className="min-h-11 w-full rounded-lg border border-border bg-black/25 py-2 pl-9 pr-3 text-sm text-stone-100 outline-none placeholder:text-stone-400 focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                />
              </label>
            </div>

            <div aria-label="Filter signals" className="mt-3 flex flex-wrap gap-2">
              {filters.map((option) => {
                const isActive = filter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setFilter(option.value)}
                    className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                      isActive
                        ? "border-accent/50 bg-accent/15 text-accent-100"
                        : "border-border bg-black/20 text-stone-300 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {visibleItems.length > 0 ? (
            <ol className="divide-y divide-border">
              {visibleItems.map((item, index) => {
                const { signal } = item;
                const match = signal.match?.trim() || "Match unavailable";
                const severity = (signal.severity ?? "LOW").toUpperCase();
                const outcome = getSignalOutcome(signal);
                const fieldPressure = signal.evidence?.scoresContext?.fieldPressureScore;
                const isFieldBacked = (fieldPressure ?? 0) >= 22;
                const confidence = signal.confidence ?? signal.confidenceScore;
                const proofPreview = item.proofHash
                  ? `${item.proofHash.slice(0, 10)}…${item.proofHash.slice(-6)}`
                  : "Pending";

                return (
                  <li key={`${item.source}-${signal.id ?? index}`} className="min-w-0 bg-black/10 p-3 sm:p-4">
                    <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_minmax(9rem,0.55fr)]">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="min-w-0 break-words text-sm font-semibold text-white">{match}</h3>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityTone(severity)}`}>
                            {severity}
                          </span>
                        </div>
                        <p className="mt-1 break-words text-xs text-stone-400">
                          {signalTypeLabel(getSignalType(signal))} · {getSignalTarget(signal)} · {item.source}
                        </p>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                          <div>
                            <dt className="text-stone-400">Odds</dt>
                            <dd className="mt-0.5 font-mono text-stone-100">
                              {formatOdds(signal.oddsBefore)} → {formatOdds(signal.oddsAfter)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-stone-400">Movement</dt>
                            <dd className="mt-0.5 font-mono text-info-200">{formatOddsChange(signal.oddsChangePct)}</dd>
                          </div>
                          <div>
                            <dt className="text-stone-400">Confidence</dt>
                            <dd className="mt-0.5 font-mono text-stone-100">
                              {typeof confidence === "number" ? `${confidence}%` : "Not scored"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-stone-400">Outcome</dt>
                            <dd className="mt-0.5 font-semibold text-stone-300">{outcome}</dd>
                          </div>
                        </dl>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-stone-300">Evidence chain</p>
                        <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-md border border-border bg-black/20 text-[10px]">
                          <div className="min-w-0 border-t-2 border-t-info p-2">
                            <p className="text-stone-400">Market</p>
                            <p className="mt-1 truncate font-mono text-info-200">{formatOddsChange(signal.oddsChangePct)}</p>
                          </div>
                          <div
                            className={`min-w-0 border-l border-t-2 border-l-border p-2 ${
                              isFieldBacked ? "border-t-positive" : "border-t-border"
                            }`}
                          >
                            <p className="text-stone-400">Field</p>
                            <p className={`mt-1 truncate font-mono ${isFieldBacked ? "text-positive-200" : "text-stone-300"}`}>
                              {fieldPressure ?? "None"}
                            </p>
                          </div>
                          <div
                            className={`min-w-0 border-l border-t-2 border-l-border p-2 ${
                              item.proofHash ? "border-t-proof" : "border-t-border"
                            }`}
                          >
                            <p className="text-stone-400">Proof</p>
                            <p
                              className={`mt-1 truncate font-mono ${
                                item.proofHash ? "text-proof-200" : "text-stone-300"
                              }`}
                            >
                              {item.proofHash ? "Linked" : "Pending"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex min-w-0 flex-col justify-between gap-3 md:items-end">
                        <div className="min-w-0 text-left text-[10px] text-stone-400 md:text-right">
                          <p className="break-all font-mono">{proofPreview}</p>
                          <p className="mt-1">{formatTime(signal.createdAt)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelectSignal(signal)}
                          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 text-xs font-semibold text-accent-100 transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                        >
                          <span>Inspect signal: {match}</span>
                          <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="p-4">
              {outcomeVerificationItems.length === 0 ? (
                <EmptyState reason="GoalPulse is waiting for a live signal or replay before it can build the triage queue." />
              ) : (
                <EmptyState
                  reason="No signals match the current search and filter."
                  action={
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="min-h-11 rounded-lg border border-accent/50 bg-accent/10 px-3 text-xs font-semibold text-accent-100 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      Clear filters
                    </button>
                  }
                />
              )}
            </div>
          )}

          {visibleItems.length > 0 && hasFilters && (
            <div className="border-t border-border p-3 text-right">
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-11 rounded-lg px-3 text-xs font-semibold text-stone-300 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                Clear filters
              </button>
            </div>
          )}
        </Card>

        <aside aria-label="Live pattern scan" role="region" className="min-w-0 space-y-4">
          <SteamMoveDetectionPanel />
          <SignalCorrelationPanel />
        </aside>
      </div>

      <section aria-label="Signal explainability" role="region" className="min-w-0">
        <SignalIntelligencePanel />
      </section>
    </div>
  );
}
