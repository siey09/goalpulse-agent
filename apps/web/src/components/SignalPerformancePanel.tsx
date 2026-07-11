import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";
import type { StatusTone } from "./ui/StatusBadge";
import { EmptyState } from "./ui/EmptyState";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type SignalTypePerformance = {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
};

type EventLatencySummary = {
  sampledCount: number;
  medianGapMs: number;
  p25GapMs: number;
  p75GapMs: number;
  negativeGapCount: number;
  negativeGapPct: number;
};

function accuracyTone(accuracyPct: number): StatusTone {
  if (accuracyPct >= 70) return "positive";
  if (accuracyPct >= 50) return "warning";
  return "danger";
}

const ACCURACY_TEXT: Record<StatusTone, string> = {
  positive: "text-positive",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-stone-300",
  accent: "text-accent-soft",
  proof: "text-proof",
};

export function SignalPerformancePanel() {
  const [performance, setPerformance] = useState<SignalTypePerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventLatency, setEventLatency] = useState<EventLatencySummary | null>(null);
  const [isLatencyLoading, setIsLatencyLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadPerformance() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/signal-performance`);

        if (!response.ok) throw new Error("Unable to load signal performance");

        const payload = await response.json();

        if (!isActive) return;

        const data: SignalTypePerformance[] = Array.isArray(payload.data)
          ? [...payload.data].sort((a, b) => b.settledCount - a.settledCount)
          : [];

        setPerformance(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load signal performance", error);
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadPerformance();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadEventLatency() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/signal-performance/event-latency`);

        if (!response.ok) throw new Error("Unable to load event latency");

        const payload = await response.json();

        if (!isActive) return;

        setEventLatency(payload.data ?? null);
        setIsLatencyLoading(false);
      } catch (error) {
        console.error("Failed to load event latency", error);
        if (!isActive) return;
        setIsLatencyLoading(false);
      }
    }

    loadEventLatency();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <Card className="p-5">
      <SectionHeader
        eyebrow="Track record"
        title="Signal performance"
        action={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-3 px-3 py-2">
            <TrendingUp className="h-3.5 w-3.5 text-info" />
            <span className="text-[10px] uppercase tracking-[0.1em] text-stone-400">Historical accuracy</span>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full">
            <EmptyState reason="Loading signal performance..." />
          </div>
        ) : performance.length === 0 ? (
          <div className="col-span-full">
            <EmptyState reason="No settled signals yet." />
          </div>
        ) : (
          performance.map((entry) => (
            <div
              key={entry.signalType}
              className="rounded-xl border border-border bg-surface-3 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                {entry.signalType}
              </p>
              <p className={`mt-2 font-mono text-3xl font-semibold ${ACCURACY_TEXT[accuracyTone(entry.accuracyPct)]}`}>
                {entry.accuracyPct}%
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {entry.correctCount} / {entry.settledCount} correct
              </p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          Event-to-signal latency (proxy metric)
        </p>
        {isLatencyLoading ? (
          <p className="mt-2 text-sm text-stone-400">Loading...</p>
        ) : !eventLatency ? (
          <p className="mt-2 text-sm text-stone-400">
            No signals with both timestamps yet.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-stone-300">
              Median gap between a signal's attached TXODDS event and its
              triggering odds tick:{" "}
              <span className="font-mono font-semibold text-white">
                {(eventLatency.medianGapMs / 1000).toFixed(1)}s
              </span>{" "}
              (p25 {(eventLatency.p25GapMs / 1000).toFixed(1)}s, p75{" "}
              {(eventLatency.p75GapMs / 1000).toFixed(1)}s, n=
              {eventLatency.sampledCount}).
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Not a true "market reaction time" - this is the gap between
              whichever event ended up attached to a signal and that
              signal's own tick. {eventLatency.negativeGapPct}% of samples
              show a negative gap, a feed-polling artifact between TXODDS
              Scores and TxLINE odds (two independently-polled feeds), not
              the market reacting before the event.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
