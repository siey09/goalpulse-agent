import { useEffect, useState } from "react";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusBadge, type StatusTone } from "./ui/StatusBadge";
import { EmptyState } from "./ui/EmptyState";
import { EvidenceStamp } from "./ui/EvidenceStamp";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type PatternCluster = {
  side: "home" | "away" | "draw";
  severity: "HIGH" | "MEDIUM" | "LOW";
  market: "1x2" | "totals";
  matchIds: string[];
  matchCount: number;
  signalCount: number;
  windowStart: string;
  windowEnd: string;
  spanMs: number;
  signalIds: string[];
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatClusterTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function severityTone(severity: PatternCluster["severity"]): StatusTone {
  if (severity === "HIGH") return "danger";
  if (severity === "MEDIUM") return "warning";
  return "info";
}

export function SignalCorrelationPanel() {
  const [clusters, setClusters] = useState<PatternCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadCorrelation() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/signal-correlation/patterns`);

        if (!response.ok) throw new Error("Unable to load signal correlation");

        const payload = await response.json();

        if (!isActive) return;

        const raw: PatternCluster[] = Array.isArray(payload.data) ? payload.data : [];

        setClusters(raw);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load signal correlation", error);
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadCorrelation();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <Card className="p-5">
      <SectionHeader
        eyebrow="Cross-match analysis"
        title="Signal correlation"
        action={<StatusBadge label="Pattern matched" tone="info" />}
      />

      <div className="space-y-3">
        {isLoading ? (
          <EmptyState reason="Loading signal correlation..." />
        ) : clusters.length === 0 ? (
          <EmptyState reason="No cross-match signal patterns detected yet." />
        ) : (
          clusters.map((cluster, index) => (
            <div
              key={`${cluster.windowStart}-${index}`}
              className="rounded-xl border border-border bg-surface-3 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <StatusBadge
                  label={`${cluster.side} · ${cluster.severity} · ${cluster.market}`}
                  tone={severityTone(cluster.severity)}
                />
                <span className="text-sm font-semibold text-white">
                  {cluster.matchCount} real matches
                </span>
              </div>
              <p className="text-xs text-stone-400">
                {cluster.signalCount} signals over {formatDuration(cluster.spanMs)} ·{" "}
                <span className="font-semibold text-stone-300">
                  Detected {formatClusterTime(cluster.windowStart)}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cluster.matchIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-full bg-black/25 px-2 py-1 font-mono text-[10px] text-stone-400"
                  >
                    Match {id}
                  </span>
                ))}
              </div>
              <EvidenceStamp
                rule={`${cluster.matchCount}+ MATCHES · SAME PATTERN`}
                delta={`${cluster.signalCount} signals / ${formatDuration(cluster.spanMs)}`}
                tone="neutral"
              />
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
