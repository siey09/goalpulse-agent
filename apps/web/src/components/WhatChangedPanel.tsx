import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, ShieldCheck, Zap } from "lucide-react";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusBadge } from "./ui/StatusBadge";
import { MetricCard } from "./ui/MetricCard";
import { EmptyState } from "./ui/EmptyState";

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
    green: "border-positive/30 bg-positive/10 text-positive",
    orange: "border-accent/30 bg-accent/10 text-accent-soft",
    blue: "border-info/30 bg-info/10 text-info",
    violet: "border-proof/30 bg-proof/10 text-proof",
  } as const;

  return (
    <Card className="p-5">
      <SectionHeader
        eyebrow="Live audit trail"
        title="What changed?"
        action={<StatusBadge label="Live updates" tone="positive" withDot />}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Updates"
          value={stats.txlineUpdates ?? 0}
          caveat="TxLINE snapshots stored"
          tone="neutral"
          icon={<Activity className="h-4 w-4 text-accent-soft" />}
        />
        <MetricCard
          label="Signals"
          value={stats.signalsGenerated ?? signals.length}
          caveat="Detected movement events"
          tone="warning"
          icon={<Zap className="h-4 w-4 text-warning" />}
        />
        <MetricCard
          label="Results"
          value={recentResults.length}
          caveat="Finished matches tracked"
          tone="positive"
          icon={<ShieldCheck className="h-4 w-4 text-positive" />}
        />
      </div>

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <EmptyState reason="Loading latest changes..." />
        ) : (
          feedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface-3 p-3"
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
    </Card>
  );
}

