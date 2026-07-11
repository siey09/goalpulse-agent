import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";
import { EmptyState } from "./ui/EmptyState";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type ConfidenceBucketPerformance = {
  bucket: "0-25" | "25-50" | "50-75" | "75-100";
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
};

function accuracyBarClass(accuracyPct: number) {
  if (accuracyPct >= 70) return "bg-positive";
  if (accuracyPct >= 50) return "bg-warning";
  return "bg-danger";
}

function accuracyTextClass(accuracyPct: number) {
  if (accuracyPct >= 70) return "text-positive";
  if (accuracyPct >= 50) return "text-warning";
  return "text-danger";
}

export function ConfidenceCalibrationPanel() {
  const [buckets, setBuckets] = useState<ConfidenceBucketPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadCalibration() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/signal-performance/by-confidence`);

        if (!response.ok) throw new Error("Unable to load confidence calibration");

        const payload = await response.json();

        if (!isActive) return;

        const data: ConfidenceBucketPerformance[] = Array.isArray(payload.data)
          ? payload.data
          : [];

        setBuckets(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load confidence calibration", error);
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadCalibration();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <Card className="p-5">
      <SectionHeader
        eyebrow="Calibration check"
        title="Confidence calibration"
        action={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-3 px-3 py-2">
            <Target className="h-3.5 w-3.5 text-info" />
            <span className="text-[10px] uppercase tracking-[0.1em] text-stone-400">Score vs. accuracy</span>
          </div>
        }
      />

      <div className="space-y-3">
        {isLoading ? (
          <EmptyState reason="Loading confidence calibration..." />
        ) : buckets.length === 0 ? (
          <EmptyState reason="Not enough settled, confidence-scored signals yet." />
        ) : (
          <>
            {buckets.map((entry) => (
              <div key={entry.bucket} className="rounded-xl border border-border bg-surface-3 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Confidence {entry.bucket}
                  </span>
                  <span className={`font-mono text-sm font-semibold ${accuracyTextClass(entry.accuracyPct)}`}>
                    {entry.accuracyPct}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/15">
                  <div
                    className={`h-2 rounded-full ${accuracyBarClass(entry.accuracyPct)}`}
                    style={{ width: `${entry.accuracyPct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {entry.correctCount} / {entry.settledCount} correct
                </p>
              </div>
            ))}
            <p className="rounded-xl border border-border bg-black/10 p-3 text-[11px] leading-5 text-stone-500">
              Early data — not yet monotonic across buckets. Confidence scoring was
              recalibrated today to reduce longshot-odds overconfidence; these
              settled signals mostly predate that change, so expect this to
              sharpen as new signals settle under the updated model.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
