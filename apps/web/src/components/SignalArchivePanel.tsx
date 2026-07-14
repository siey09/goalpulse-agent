import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
} from "lucide-react";
import type { AgentSignal } from "../types";
import { Card } from "./ui/Card";
import { StatusBadge, type StatusTone } from "./ui/StatusBadge";
import { EmptyState } from "./ui/EmptyState";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type ArchiveEntry = {
  signalId: string;
  event: "created" | "settled";
  matchId: string;
  side: "home" | "away" | "draw";
  signalType: string;
  severity: string;
  resultStatus: "pending" | "correct" | "incorrect";
  momentumScore: number;
  oddsChangePct: number;
  archivedAt: string;
  signalData?: {
    match?: string;
    target?: string;
    explanation?: string;
    confidenceScore?: number;
  };
};

/**
 * Archive rows contain a narrower permanent record than live signals.
 * Map only fields that genuinely exist; the audit drawer provides honest
 * fallbacks for live-only evidence rather than fabricating it.
 */
function archiveEntryToSignal(entry: ArchiveEntry): AgentSignal {
  return {
    id: entry.signalId,
    matchId: entry.matchId,
    match: entry.signalData?.match,
    target: entry.signalData?.target,
    side: entry.side,
    type: entry.signalType,
    severity: entry.severity,
    momentumScore: entry.momentumScore,
    oddsChangePct: entry.oddsChangePct,
    confidenceScore: entry.signalData?.confidenceScore,
    explanation: entry.signalData?.explanation,
    createdAt: entry.archivedAt,
    resultStatus: entry.resultStatus,
  };
}

type ArchivePagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type StatusFilter = "all" | "pending" | "correct" | "incorrect";
type MarketFilter = "all" | "1x2" | "totals";
type EventFilter = "settled" | "created" | "all";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resultStatusTone(status: ArchiveEntry["resultStatus"]): StatusTone {
  if (status === "correct") return "positive";
  if (status === "incorrect") return "danger";
  return "warning";
}

function severityTone(severity: string): StatusTone {
  if (severity === "HIGH") return "danger";
  if (severity === "MEDIUM") return "warning";
  if (severity === "LOW") return "info";
  return "neutral";
}

function resultMarkerClass(status: ArchiveEntry["resultStatus"]) {
  if (status === "correct") return "bg-positive";
  if (status === "incorrect") return "bg-danger";
  return "bg-warning";
}

export interface SignalArchivePanelProps {
  onSelectSignal?: (signal: AgentSignal) => void;
}

export function SignalArchivePanel({ onSelectSignal }: SignalArchivePanelProps = {}) {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [pagination, setPagination] = useState<ArchivePagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [matchIdInput, setMatchIdInput] = useState("");
  const [matchIdFilter, setMatchIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [eventFilter, setEventFilter] = useState<EventFilter>("settled");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setMatchIdFilter(matchIdInput);
      setPage(1);
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [matchIdInput]);

  useEffect(() => {
    let isActive = true;

    async function loadArchive() {
      try {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", "25");
        if (matchIdFilter.trim()) params.set("matchId", matchIdFilter.trim());
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (marketFilter !== "all") params.set("market", marketFilter);
        if (eventFilter !== "all") params.set("event", eventFilter);

        const response = await fetch(`${API_BASE_URL}/api/archive?${params.toString()}`);
        if (!response.ok) throw new Error("Unable to load archive");

        const payload = await response.json();
        if (!isActive) return;

        setEntries(Array.isArray(payload.data) ? payload.data : []);
        setPagination(payload.pagination ?? null);
        setIsLoading(false);
      } catch (loadError) {
        console.error("Failed to load signal archive", loadError);
        if (!isActive) return;
        setEntries([]);
        setPagination(null);
        setError("The permanent record could not be reached. Check the data service, then retry.");
        setIsLoading(false);
      }
    }

    loadArchive();
    return () => {
      isActive = false;
    };
  }, [page, matchIdFilter, statusFilter, marketFilter, eventFilter, requestVersion]);

  const hasActiveFilters =
    matchIdInput.trim() !== "" ||
    statusFilter !== "all" ||
    marketFilter !== "all" ||
    eventFilter !== "settled";

  const visibleStart = pagination && entries.length > 0
    ? (pagination.page - 1) * pagination.pageSize + 1
    : 0;
  const visibleEnd = pagination
    ? Math.min(pagination.totalCount, visibleStart + entries.length - 1)
    : 0;

  const selectClassName =
    "h-11 min-w-0 rounded-lg border border-border bg-surface-3 px-3 text-sm font-medium text-stone-200 outline-none transition hover:border-border-strong focus:border-accent";

  function clearFilters() {
    setMatchIdInput("");
    setMatchIdFilter("");
    setStatusFilter("all");
    setMarketFilter("all");
    setEventFilter("settled");
    setPage(1);
  }

  function inspectEntry(entry: ArchiveEntry) {
    onSelectSignal?.(archiveEntryToSignal(entry));
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-white">
            Permanent signal ledger
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-stone-400">
            Every created and settled signal, preserved independently from the live dashboard.
          </p>
        </div>
        <StatusBadge
          label={pagination
            ? `${pagination.totalCount} ${pagination.totalCount === 1 ? "record" : "records"}`
            : isLoading
              ? "Loading"
              : "Unavailable"}
          tone="proof"
        />
      </div>

      <div className="border-b border-border bg-black/10 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex h-11 min-w-0 items-center gap-3 rounded-lg border border-border bg-surface-3 px-3 transition hover:border-border-strong focus-within:border-accent sm:col-span-2">
            <Search className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search archive"
              value={matchIdInput}
              onChange={(event) => setMatchIdInput(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-400"
              placeholder="Search match ID"
            />
          </label>

          <select
            aria-label="Outcome"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as StatusFilter);
              setPage(1);
            }}
            className={selectClassName}
          >
            <option value="all">All outcomes</option>
            <option value="pending">Pending</option>
            <option value="correct">Correct</option>
            <option value="incorrect">Incorrect</option>
          </select>

          <select
            aria-label="Market"
            value={marketFilter}
            onChange={(event) => {
              setMarketFilter(event.target.value as MarketFilter);
              setPage(1);
            }}
            className={selectClassName}
          >
            <option value="all">All markets</option>
            <option value="1x2">1X2</option>
            <option value="totals">Totals</option>
          </select>

          <select
            aria-label="Record type"
            value={eventFilter}
            onChange={(event) => {
              setEventFilter(event.target.value as EventFilter);
              setPage(1);
            }}
            className={selectClassName}
          >
            <option value="settled">Settled records</option>
            <option value="created">Created records</option>
            <option value="all">All record types</option>
          </select>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-stone-300 transition hover:border-border-strong hover:bg-white/5 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Clear filters
            </button>
          ) : (
            <div className="hidden h-11 lg:block" aria-hidden="true" />
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-400">
          <span aria-live="polite">
            {pagination && entries.length > 0
              ? `Showing ${visibleStart}-${visibleEnd} of ${pagination.totalCount}`
              : isLoading
                ? "Reading permanent record…"
                : "No visible records"}
          </span>
          <span>25 records per page</span>
        </div>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border" aria-label="Loading archive records">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="grid grid-cols-3 gap-4 px-4 py-4 sm:px-5">
              <div className="h-4 animate-pulse rounded bg-white/10" />
              <div className="h-4 animate-pulse rounded bg-white/5" />
              <div className="h-4 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 rounded-xl border border-danger/25 bg-danger/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-danger-200">Archive unavailable</p>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-stone-300">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setRequestVersion((current) => current + 1)}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-bold text-black transition hover:bg-danger-300"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Retry archive
            </button>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            reason={
              hasActiveFilters
                ? "No archived signals match the current filters."
                : "No permanent signal records have been written yet."
            }
            action={
              hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="font-semibold text-accent-soft hover:text-accent-100"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full table-fixed" aria-label="Permanent signal archive">
              <thead className="border-b border-border bg-black/15 text-left text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                <tr>
                  <th className="px-5 py-3">Fixture</th>
                  <th className="px-4 py-3">Signal</th>
                  <th className="px-4 py-3">Movement</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Archived</th>
                  <th className="px-3 py-3"><span className="sr-only">Inspect</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => {
                  const matchName = entry.signalData?.match ?? entry.matchId;
                  return (
                    <tr key={`${entry.signalId}-${entry.event}`} className="group transition hover:bg-white/5">
                      <td className="relative px-5 py-3.5 align-middle">
                        <span
                          className={`absolute inset-y-3 left-0 w-1 rounded-r ${resultMarkerClass(entry.resultStatus)}`}
                          aria-hidden="true"
                        />
                        <p className="truncate text-sm font-semibold text-white" title={matchName}>{matchName}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-stone-400">{entry.matchId}</p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex items-center gap-2">
                          <StatusBadge label={entry.severity} tone={severityTone(entry.severity)} />
                          <span className="truncate text-xs font-medium text-stone-200">
                            {entry.signalType.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-stone-400">
                          {entry.side} → {entry.signalData?.target ?? "Target unavailable"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <p className="font-mono text-sm font-semibold text-accent-soft">{entry.oddsChangePct}%</p>
                        <p className="mt-1 text-[10px] uppercase text-stone-400">odds delta</p>
                      </td>
                      <td className="px-4 py-3.5 align-middle font-mono text-sm text-stone-200">
                        {entry.signalData?.confidenceScore !== undefined
                          ? `${Math.round(entry.signalData.confidenceScore)} / 100`
                          : "—"}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <StatusBadge label={entry.resultStatus} tone={resultStatusTone(entry.resultStatus)} />
                        <p className="mt-1 text-[10px] capitalize text-stone-400">{entry.event}</p>
                      </td>
                      <td className="px-4 py-3.5 align-middle text-xs text-stone-300">
                        {formatDate(entry.archivedAt)}
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <button
                          type="button"
                          aria-label={`Inspect ${matchName}`}
                          onClick={() => inspectEntry(entry)}
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-400 transition hover:bg-accent/10 hover:text-accent-soft"
                        >
                          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border lg:hidden">
            {entries.map((entry) => {
              const matchName = entry.signalData?.match ?? entry.matchId;
              return (
                <button
                  key={`${entry.signalId}-${entry.event}`}
                  type="button"
                  aria-label={`Inspect ${matchName}`}
                  onClick={() => inspectEntry(entry)}
                  className="relative w-full px-4 py-4 text-left transition hover:bg-white/5"
                >
                  <span
                    className={`absolute inset-y-4 left-0 w-1 rounded-r ${resultMarkerClass(entry.resultStatus)}`}
                    aria-hidden="true"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{matchName}</p>
                      <p className="mt-1 truncate text-xs text-stone-400">
                        {entry.signalType.replaceAll("_", " ")} · {entry.side} → {entry.signalData?.target ?? "Target unavailable"}
                      </p>
                    </div>
                    <StatusBadge label={entry.resultStatus} tone={resultStatusTone(entry.resultStatus)} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3 text-xs">
                    <div>
                      <p className="text-stone-400">Move</p>
                      <p className="mt-1 font-mono font-semibold text-accent-soft">{entry.oddsChangePct}%</p>
                    </div>
                    <div>
                      <p className="text-stone-400">Confidence</p>
                      <p className="mt-1 font-mono font-semibold text-stone-200">
                        {entry.signalData?.confidenceScore !== undefined
                          ? `${Math.round(entry.signalData.confidenceScore)} / 100`
                          : "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-stone-400">Archived</p>
                      <p className="mt-1 text-stone-200">{formatDate(entry.archivedAt)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-stone-400 sm:px-5">
          <button
            type="button"
            aria-label="Previous archive page"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="flex h-11 items-center gap-2 rounded-lg border border-border px-3 font-semibold transition hover:border-border-strong hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Previous</span>
          </button>

          <span>Page {pagination.page} of {pagination.totalPages}</span>

          <button
            type="button"
            aria-label="Next archive page"
            onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            disabled={page >= pagination.totalPages}
            className="flex h-11 items-center gap-2 rounded-lg border border-border px-3 font-semibold transition hover:border-border-strong hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </Card>
  );
}
