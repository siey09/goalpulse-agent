import { useEffect, useState } from "react";
import { Archive, Search } from "lucide-react";

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

function resultStatusClass(status: ArchiveEntry["resultStatus"]) {
  if (status === "correct") return "text-emerald-300";
  if (status === "incorrect") return "text-rose-300";
  return "text-amber-300";
}

function severityClass(severity: string) {
  if (severity === "HIGH") return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  if (severity === "MEDIUM") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (severity === "LOW") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  return "border-white/10 bg-black/20 text-stone-400";
}

export function SignalArchivePanel() {
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
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Permanent history</p>
          <h2 className="text-xl font-semibold text-white">Full tournament archive</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
          <Archive className="h-3.5 w-3.5" />
          {pagination ? `${pagination.totalCount} archived` : "Loading"}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-sm text-stone-400">
        <Search className="h-4 w-4" />
        <input
          value={matchIdInput}
          onChange={(event) => setMatchIdInput(event.target.value)}
          className="w-full bg-transparent text-sm text-stone-200 outline-none placeholder:text-stone-500"
          placeholder="Filter by match ID"
        />
      </div>

      <div className="mb-2 grid grid-cols-4 gap-1.5 rounded-2xl bg-black/20 p-1">
        {(["all", "pending", "correct", "incorrect"] as const).map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
            className={`rounded-xl px-2 py-2 text-[10px] font-semibold capitalize transition ${
              statusFilter === status
                ? "bg-orange-400/15 text-orange-200"
                : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5 rounded-2xl bg-black/20 p-1">
        {(["all", "1x2", "totals"] as const).map((market) => (
          <button
            key={market}
            onClick={() => {
              setMarketFilter(market);
              setPage(1);
            }}
            className={`rounded-xl px-2 py-2 text-[10px] font-semibold uppercase transition ${
              marketFilter === market
                ? "bg-orange-400/15 text-orange-200"
                : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
            }`}
          >
            {market}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-black/20 p-1">
        {(["settled", "created", "all"] as const).map((eventOption) => (
          <button
            key={eventOption}
            onClick={() => {
              setEventFilter(eventOption);
              setPage(1);
            }}
            className={`rounded-xl px-2 py-2 text-[10px] font-semibold capitalize transition ${
              eventFilter === eventOption
                ? "bg-orange-400/15 text-orange-200"
                : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
            }`}
          >
            {eventOption}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading archive...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            No archived signals match these filters.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={`${entry.signalId}-${entry.event}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white">
                  {entry.signalData?.match ?? entry.matchId}
                </span>
                <span
                  className={`shrink-0 text-xs font-semibold ${resultStatusClass(entry.resultStatus)}`}
                >
                  {entry.resultStatus}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                <span
                  className={`rounded-full border px-2 py-0.5 font-semibold ${severityClass(entry.severity)}`}
                >
                  {entry.severity}
                </span>
                <span>{entry.signalType}</span>
                <span>
                  {entry.side} → {entry.signalData?.target ?? "?"}
                </span>
                <span>{entry.oddsChangePct}%</span>
                <span className="ml-auto text-stone-500">{formatDate(entry.archivedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-stone-400">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 font-semibold disabled:opacity-30"
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
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 font-semibold disabled:opacity-30"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
