import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type SteamMove = {
  matchId: string;
  match: string;
  side: "home" | "away";
  tickCount: number;
  totalMovePct: number;
  windowMs: number;
  firstOdds: number;
  lastOdds: number;
  firstTickAt: string;
  lastTickAt: string;
};

type SteamMoveSummary = {
  matchesScanned: number;
  steamMovesDetected: number;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function SteamMoveDetectionPanel() {
  const [moves, setMoves] = useState<SteamMove[]>([]);
  const [summary, setSummary] = useState<SteamMoveSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadSteamMoves() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/steam-moves`);
        const payload = (await response.json()) as {
          data?: SteamMove[];
          summary?: SteamMoveSummary;
        };

        if (!isActive) return;

        setMoves(payload.data ?? []);
        setSummary(payload.summary ?? null);
      } catch (error) {
        console.error("Failed to load steam moves", error);
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    loadSteamMoves();

    const timer = window.setInterval(loadSteamMoves, 5000);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Live market scan</p>
          <h2 className="text-xl font-semibold text-white">Steam move detection</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold text-orange-200">
          <Zap className="h-3.5 w-3.5" />
          {summary ? `${summary.matchesScanned} matches scanned` : "Scanning"}
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading steam moves...
          </div>
        ) : moves.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            No steam move happening right now — scanning every 5s.
          </div>
        ) : (
          moves.map((move) => (
            <div key={move.matchId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{move.match}</span>
                <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-200">
                  {move.side}
                </span>
              </div>
              <p className="text-2xl font-semibold text-orange-300">
                {move.firstOdds.toFixed(2)} &rarr; {move.lastOdds.toFixed(2)}
                <span className="ml-2 text-sm font-semibold text-orange-200">
                  ({move.totalMovePct}%)
                </span>
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {move.tickCount} consecutive ticks over {formatDuration(move.windowMs)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
