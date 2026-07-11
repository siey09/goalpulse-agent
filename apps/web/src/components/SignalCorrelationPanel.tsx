import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";

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

function severityClass(severity: PatternCluster["severity"]) {
  if (severity === "HIGH") return "border-red-400/20 bg-red-400/10 text-red-200";
  if (severity === "MEDIUM") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-sky-400/20 bg-sky-400/10 text-sky-200";
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
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Cross-match analysis</p>
          <h2 className="text-xl font-semibold text-white">Signal correlation</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
          <Link2 className="h-3.5 w-3.5" />
          Pattern matched
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading signal correlation...
          </div>
        ) : clusters.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            No cross-match signal patterns detected yet.
          </div>
        ) : (
          clusters.map((cluster, index) => (
            <div
              key={`${cluster.windowStart}-${index}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${severityClass(cluster.severity)}`}
                >
                  {cluster.side} · {cluster.severity} · {cluster.market}
                </span>
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
                    className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-stone-400"
                  >
                    Match {id}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
