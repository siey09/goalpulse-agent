import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Radio, ShieldCheck, Zap } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: "scheduled" | "live" | "finished";
  lastUpdated: string;
};

type AgentSignal = {
  id: string;
  matchId: string;
  homeTeam?: string;
  awayTeam?: string;
  match?: string;
  target?: string;
  type?: string;
  signalType?: string;
  severity?: string;
  side?: string;
  confidence?: number;
  movementPct?: number;
  oddsChangePct?: number;
  createdAt?: string;
  evidence?: {
    source?: string;
    endpointUsed?: string;
    proofLabel?: string;
  };
};

type AgentStats = {
  txlineUpdates?: number;
  signalsGenerated?: number;
  highSeverity?: number;
  pendingSignals?: number;
  correctSignals?: number;
  incorrectSignals?: number;
};

type FeedItem = {
  id: string;
  label: string;
  detail: string;
  tone: "green" | "orange" | "blue" | "violet";
  time?: string;
};

function asArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    for (const key of keys) {
      if (Array.isArray(record[key])) {
        return record[key] as T[];
      }
    }
  }

  return [];
}

function formatPct(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "movement detected";
  return `${value.toFixed(1)}% movement`;
}

function formatTime(value?: string) {
  if (!value) return "just now";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "just now";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WhatChangedPanel() {
  const [signals, setSignals] = useState<AgentSignal[]>([]);
  const [recentResults, setRecentResults] = useState<Match[]>([]);
  const [stats, setStats] = useState<AgentStats>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadChanges() {
      try {
        const [signalsResponse, recentResultsResponse, statsResponse] =
          await Promise.all([
            fetch(`${API_BASE_URL}/api/signals`),
            fetch(`${API_BASE_URL}/api/recent-results`),
            fetch(`${API_BASE_URL}/api/stats`),
          ]);

        if (!signalsResponse.ok || !recentResultsResponse.ok || !statsResponse.ok) {
          throw new Error("Unable to load latest changes");
        }

        const [signalsPayload, recentResultsPayload, statsPayload] =
          await Promise.all([
            signalsResponse.json(),
            recentResultsResponse.json(),
            statsResponse.json(),
          ]);

        if (!isActive) return;

        setSignals(asArray<AgentSignal>(signalsPayload, ["signals", "data"]));
        setRecentResults(asArray<Match>(recentResultsPayload, ["matches", "data"]));
        const normalizedStats =
          statsPayload && typeof statsPayload === "object" && "data" in statsPayload
            ? (statsPayload as { data: AgentStats }).data
            : (statsPayload as AgentStats);

        setStats(normalizedStats);
        setIsLoading(false);
      } catch {
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadChanges();

    const interval = window.setInterval(loadChanges, 5000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, []);

  const feedItems = useMemo<FeedItem[]>(() => {
    const latestSignals = signals.slice(0, 3).map((signal) => {
      const matchLabel =
        signal.match ??
        `${signal.homeTeam ?? "Unknown"} vs ${signal.awayTeam ?? "Unknown"}`;
      const signalTypeLabel = signal.signalType ?? signal.type ?? "Odds move";
      const movementLabel = formatPct(signal.oddsChangePct ?? signal.movementPct);

      return {
        id: `signal-${signal.id}`,
        label: signal.severity === "HIGH" ? "High-confidence movement" : "Signal detected",
        detail: `${matchLabel}: ${signalTypeLabel} · ${movementLabel}`,
        tone: signal.severity === "HIGH" ? "orange" : "blue",
        time: signal.createdAt,
      };
    }) satisfies FeedItem[];

    const finishedMatches = recentResults.slice(0, 3).map((match) => ({
      id: `result-${match.id}`,
      label: "Finished match archived",
      detail: `${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`,
      tone: "green",
      time: match.lastUpdated,
    })) satisfies FeedItem[];

    const proofItem: FeedItem = {
      id: "proof-txline",
      label: "TxLINE evidence verified",
      detail: `${stats.txlineUpdates ?? 0} odds snapshots stored · ${
        stats.signalsGenerated ?? signals.length
      } signals generated`,
      tone: "violet",
    };

    return [proofItem, ...latestSignals, ...finishedMatches].slice(0, 7);
  }, [signals, recentResults, stats]);

  const toneClass = {
    green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    orange: "border-orange-400/30 bg-orange-400/10 text-orange-200",
    blue: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    violet: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  } as const;

  return (
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Live audit trail</p>
          <h2 className="text-xl font-semibold text-white">What changed?</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
          <Radio className="h-3.5 w-3.5" />
          Live updates
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Activity className="h-4 w-4 text-orange-300" />
            Updates
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">
            {stats.txlineUpdates ?? 0}
          </p>
          <p className="mt-1 text-xs text-stone-500">TxLINE snapshots stored</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Zap className="h-4 w-4 text-amber-300" />
            Signals
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">
            {stats.signalsGenerated ?? signals.length}
          </p>
          <p className="mt-1 text-xs text-stone-500">Detected movement events</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            Results
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">
            {recentResults.length}
          </p>
          <p className="mt-1 text-xs text-stone-500">Finished matches tracked</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading latest changes...
          </div>
        ) : (
          feedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 rounded-full border p-1.5 ${toneClass[item.tone]}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-stone-400">
                    {item.detail}
                  </p>
                </div>
              </div>

              <span className="shrink-0 text-[11px] text-stone-500">
                {formatTime(item.time)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

