import { useEffect, useState } from "react";
import { Search } from "lucide-react";
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
 * Archive rows don't carry the full live-signal shape (no oddsBefore/
 * oddsAfter, no evidence/scoresContext, no probabilityPointShiftPct -
 * the permanent archive is a narrower record than the in-memory
 * signal). The Signal Audit Drawer already renders honest fallbacks
 * for whatever's missing rather than fabricating it, so mapping only
 * the fields that genuinely exist here is safe.
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

export interface SignalArchivePanelProps {
  onSelectSignal?: (signal: AgentSignal) => void;
}

export function SignalArchivePanel({ onSelectSignal }: SignalArchivePanelProps = {}) {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [pagination, setPagination] = useState<ArchivePagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", "25");
        if (matchIdFilter.trim()) params.set("matchId", matchIdFilter.trim());
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (marketFilter !== "all") params.set("market", marketFilter);
        if (eventFilter !== "all") params.set("event", eventFilter);

        const response = await fetch(
          `${API_BASE_URL}/api/archive?${params.toString()}`
        );

        if (!response.ok) throw new Error("Unable to load archive");

        const payload = await response.json();

        if (!isActive) return;

        setEntries(Array.isArray(payload.data) ? payload.data : []);
        setPagination(payload.pagination ?? null);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load signal archive", error);
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadArchive();

    return () => {
      isActive = false;
    };
  }, [page, matchIdFilter, statusFilter, marketFilter, eventFilter]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Permanent history</p>
          <h2 className="text-xl font-semibold text-white">Full tournament archive</h2>
        </div>

        <StatusBadge
          label={pagination ? `${pagination.totalCount} archived` : "Loading"}
          tone="proof"
        />
      </div>

      <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-surface-3 px-4 py-3 text-sm text-stone-400">
        <Search className="h-4 w-4" />
        <input
          value={matchIdInput}
          onChange={(event) => setMatchIdInput(event.target.value)}
          className="w-full bg-transparent text-sm text-stone-200 outline-none placeholder:text-stone-500"
          placeholder="Filter by match ID"
        />
      </div>

      <div className="mb-2 grid grid-cols-4 gap-1.5 rounded-xl border border-border bg-black/20 p-1">
        {(["all", "pending", "correct", "incorrect"] as const).map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
            className={`rounded-lg px-2 py-2 text-[10px] font-semibold capitalize transition ${
              statusFilter === status
                ? "bg-accent/15 text-accent-soft"
                : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-black/20 p-1">
        {(["all", "1x2", "totals"] as const).map((market) => (
          <button
            key={market}
            onClick={() => {
              setMarketFilter(market);
              setPage(1);
            }}
            className={`rounded-lg px-2 py-2 text-[10px] font-semibold uppercase transition ${
              marketFilter === market
                ? "bg-accent/15 text-accent-soft"
                : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
            }`}
          >
            {market}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-black/20 p-1">
        {(["settled", "created", "all"] as const).map((eventOption) => (
          <button
            key={eventOption}
            onClick={() => {
              setEventFilter(eventOption);
              setPage(1);
            }}
            className={`rounded-lg px-2 py-2 text-[10px] font-semibold capitalize transition ${
              eventFilter === eventOption
                ? "bg-accent/15 text-accent-soft"
                : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
            }`}
          >
            {eventOption}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <EmptyState reason="Loading archive..." />
        ) : entries.length === 0 ? (
          <EmptyState reason="No archived signals match these filters." />
        ) : (
          entries.map((entry) => (
            <button
              key={`${entry.signalId}-${entry.event}`}
              type="button"
              onClick={() => onSelectSignal?.(archiveEntryToSignal(entry))}
              className="w-full rounded-xl border border-border bg-surface-3 p-3 text-left transition hover:bg-black/30"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white">
                  {entry.signalData?.match ?? entry.matchId}
                </span>
                <StatusBadge label={entry.resultStatus} tone={resultStatusTone(entry.resultStatus)} />
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                <StatusBadge label={entry.severity} tone={severityTone(entry.severity)} />
                <span>{entry.signalType}</span>
                <span>
                  {entry.side} → {entry.signalData?.target ?? "?"}
                </span>
                <span className="font-mono">{entry.oddsChangePct}%</span>
                <span className="ml-auto text-stone-500">{formatDate(entry.archivedAt)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-stone-400">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-border bg-surface-3 px-3 py-1.5 font-semibold disabled:opacity-30"
          >
            Prev
          </button>

          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            onClick={() =>
              setPage((current) => Math.min(pagination.totalPages, current + 1))
            }
            disabled={page >= pagination.totalPages}
            className="rounded-xl border border-border bg-surface-3 px-3 py-1.5 font-semibold disabled:opacity-30"
          >
            Next
          </button>
        </div>
      ) : null}
    </Card>
  );
}
