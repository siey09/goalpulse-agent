import { useEffect, useState } from "react";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusBadge } from "./ui/StatusBadge";
import { EmptyState } from "./ui/EmptyState";
import { EvidenceStamp } from "./ui/EvidenceStamp";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type SteamMove = {
  matchId: string;
  match: string;
  side: "home" | "away" | "draw";
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
    <Card className="p-5">
      <SectionHeader
        eyebrow="Live market scan"
        title="Steam move detection"
        action={<StatusBadge label={summary ? `${summary.matchesScanned} matches scanned` : "Scanning"} tone="accent" withDot />}
      />

      <div className="space-y-3">
        {isLoading ? (
          <EmptyState reason="Loading steam moves..." />
        ) : moves.length === 0 ? (
          <EmptyState reason="No steam move happening right now — scanning every 5s." />
        ) : (
          moves.map((move) => (
            <div key={move.matchId} className="rounded-xl border border-border bg-surface-3 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{move.match}</span>
                <StatusBadge label={move.side} tone="accent" />
              </div>
              <p className="font-mono text-2xl font-semibold text-accent-soft">
                {move.firstOdds.toFixed(2)} &rarr; {move.lastOdds.toFixed(2)}
                <span className="ml-2 text-sm font-semibold text-accent-soft/80">
                  ({move.totalMovePct}%)
                </span>
              </p>
              <EvidenceStamp
                rule={`${move.tickCount} CONSECUTIVE TICKS`}
                delta={`over ${formatDuration(move.windowMs)}`}
                reference={`#${move.matchId}`}
                tone="accent"
              />
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
