import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type SignalTypePerformance = {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
};

function accuracyClass(accuracyPct: number) {
  if (accuracyPct >= 70) return "text-emerald-300";
  if (accuracyPct >= 50) return "text-amber-300";
  return "text-rose-300";
}

export function SignalPerformancePanel() {
  const [performance, setPerformance] = useState<SignalTypePerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Track record</p>
          <h2 className="text-xl font-semibold text-white">Signal performance</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
          <TrendingUp className="h-3.5 w-3.5" />
          Historical accuracy
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading signal performance...
          </div>
        ) : performance.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            No settled signals yet.
          </div>
        ) : (
          performance.map((entry) => (
            <div
              key={entry.signalType}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                {entry.signalType}
              </p>
              <p className={`mt-2 text-3xl font-semibold ${accuracyClass(entry.accuracyPct)}`}>
                {entry.accuracyPct}%
              </p>
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
