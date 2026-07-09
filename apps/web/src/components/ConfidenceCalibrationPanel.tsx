import { useEffect, useState } from "react";
import { Target } from "lucide-react";

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
  if (accuracyPct >= 70) return "bg-emerald-300";
  if (accuracyPct >= 50) return "bg-amber-300";
  return "bg-rose-300";
}

function accuracyTextClass(accuracyPct: number) {
  if (accuracyPct >= 70) return "text-emerald-300";
  if (accuracyPct >= 50) return "text-amber-300";
  return "text-rose-300";
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
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Calibration check</p>
          <h2 className="text-xl font-semibold text-white">Confidence calibration</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
          <Target className="h-3.5 w-3.5" />
          Score vs. accuracy
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading confidence calibration...
          </div>
        ) : buckets.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Not enough settled, confidence-scored signals yet.
          </div>
        ) : (
          buckets.map((entry) => (
            <div key={entry.bucket} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Confidence {entry.bucket}
                </span>
                <span className={`text-sm font-semibold ${accuracyTextClass(entry.accuracyPct)}`}>
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
          ))
        )}
      </div>
    </div>
  );
}
