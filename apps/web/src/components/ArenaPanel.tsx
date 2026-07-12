import { ShieldCheck, ShieldQuestion, Swords, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusBadge, type StatusTone } from "./ui/StatusBadge";
import { MetricCard } from "./ui/MetricCard";
import { EmptyState } from "./ui/EmptyState";
import {
  getMetaAgentRecommendation,
  type ArenaAgentId,
  type ArenaResponse,
  type ArenaScoreboard,
  type ArenaRejection,
  type MetaAgentRecommendation,
} from "../lib/arena";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

function formatUnits(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
}

const CONCENTRATION_WARNING_THRESHOLD_PCT = 50;

function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}

function getSkepticCritique(
  recommendation: MetaAgentRecommendation,
  arena: ArenaResponse | null
): string | null {
  if (!recommendation.agentId || !arena) return null;

  const leaderScoreboard =
    recommendation.agentId === "momentum_follower"
      ? arena.momentumFollower
      : recommendation.agentId === "contrarian"
        ? arena.contrarian
        : arena.kellyCriterion;

  const settled = leaderScoreboard.positions.filter((p) => p.resultStatus !== "pending");
  if (settled.length === 0) return null;

  const matchCounts = new Map<string, number>();
  for (const position of settled) {
    const base = baseMatchId(position.matchId);
    matchCounts.set(base, (matchCounts.get(base) ?? 0) + 1);
  }

  const distinctMatchCount = matchCounts.size;
  const largestMatchCount = Math.max(...matchCounts.values());
  const largestMatchSharePct = Math.round((largestMatchCount / settled.length) * 100);
  const matchWord = distinctMatchCount === 1 ? "match" : "matches";

  if (largestMatchSharePct >= CONCENTRATION_WARNING_THRESHOLD_PCT) {
    return `Skeptic check: ${leaderScoreboard.label}'s lead is concentrated — ${largestMatchSharePct}% of its ${settled.length} settled positions come from a single real match (${distinctMatchCount} distinct ${matchWord} total). Treat the lead as provisional until it settles across more matches.`;
  }

  return `Skeptic check: ${leaderScoreboard.label}'s lead is diversified across ${distinctMatchCount} distinct real matches (largest single match is ${largestMatchSharePct}% of its ${settled.length} settled positions) — not an artifact of one match's outcome.`;
}

const AGENT_TONE: Record<ArenaAgentId, StatusTone> = {
  momentum_follower: "info",
  contrarian: "accent",
  kelly_criterion: "proof",
};

function ScoreboardCard({
  scoreboard,
  rejections,
  isLeader,
  onSelectSignalId,
}: {
  scoreboard: ArenaScoreboard;
  rejections: ArenaRejection[];
  isLeader: boolean;
  onSelectSignalId?: (signalId: string) => void;
}) {
  // Defensive: rejections may be absent from an older backend response
  // (e.g. during this project's documented Render deploy-lag window,
  // where a newly-deployed frontend can briefly talk to a not-yet-updated
  // backend) - never let a shape mismatch crash the whole panel.
  const agentRejections = (rejections ?? []).filter((r) => r.agentId === scoreboard.agentId);
  const distinctReasons = Array.from(new Set(agentRejections.map((r) => r.reasonText))).slice(0, 3);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: `var(--color-${AGENT_TONE[scoreboard.agentId]})` }}
            aria-hidden="true"
          />
          <h3 className="text-lg font-semibold text-white">{scoreboard.label}</h3>
        </div>
        {isLeader && (
          <StatusBadge label="Leading" tone="warning" />
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <MetricCard
          label="Net units"
          value={formatUnits(scoreboard.netUnits)}
          tone={scoreboard.netUnits > 0 ? "positive" : scoreboard.netUnits < 0 ? "danger" : "neutral"}
        />
        <MetricCard
          label="ROI"
          value={`${scoreboard.roiPercent > 0 ? "+" : ""}${scoreboard.roiPercent}%`}
          tone={scoreboard.roiPercent > 0 ? "positive" : scoreboard.roiPercent < 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-xl border border-border bg-surface-3 p-2">
          <p className="text-stone-500">Win rate</p>
          <p className="mt-1 font-mono font-semibold text-white">{scoreboard.winRatePct}%</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-3 p-2">
          <p className="text-stone-500">Settled</p>
          <p className="mt-1 font-mono font-semibold text-white">{scoreboard.settledCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-3 p-2">
          <p className="text-stone-500">Open</p>
          <p className="mt-1 font-mono font-semibold text-white">{scoreboard.openPositions}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {scoreboard.positions.slice(0, 4).map((position) => (
          <button
            key={position.signalId}
            type="button"
            onClick={() => onSelectSignalId?.(position.signalId)}
            className="flex w-full items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2 text-left text-[11px] transition hover:bg-black/40"
          >
            <span className="truncate text-stone-300">
              {position.match} → {position.target}
            </span>
            <span
              className={`shrink-0 font-mono font-semibold ${
                position.resultStatus === "correct"
                  ? "text-positive"
                  : position.resultStatus === "incorrect"
                    ? "text-danger"
                    : "text-warning"
              }`}
            >
              {position.resultStatus === "pending" ? "pending" : formatUnits(position.profitUnits)}
            </span>
          </button>
        ))}
        {scoreboard.positions.length === 0 && (
          <p className="text-[11px] text-stone-500">No positions yet.</p>
        )}
      </div>

      {agentRejections.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">
            {agentRejections.length} signal{agentRejections.length === 1 ? "" : "s"} not traded
          </p>
          <ul className="mt-1 space-y-0.5">
            {distinctReasons.map((reasonText) => (
              <li key={reasonText} className="text-[10px] text-stone-500">
                {reasonText}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export interface ArenaPanelProps {
  onSelectSignalId?: (signalId: string) => void;
}

export function ArenaPanel({ onSelectSignalId }: ArenaPanelProps = {}) {
  const [arena, setArena] = useState<ArenaResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onchainVerify, setOnchainVerify] = useState<{
    loading: boolean;
    data: { available: boolean; reason?: string; isValid?: boolean } | null;
  }>({ loading: false, data: null });

  useEffect(() => {
    let mounted = true;

    async function loadArena() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/arena`);
        const payload = (await response.json()) as { data?: ArenaResponse };

        if (!mounted) return;

        setArena(payload.data ?? null);
      } catch (error) {
        console.error("Unable to load arena scoreboard", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadArena();

    const timer = window.setInterval(loadArena, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  async function runOnchainVerify() {
    if (!arena?.proof.verifiableStat) return;

    try {
      setOnchainVerify({ loading: true, data: null });

      const { fixtureId, seq, statKey } = arena.proof.verifiableStat;
      const response = await fetch(
        `${API_BASE_URL}/api/onchain/validate-stat?fixtureId=${fixtureId}&seq=${seq}&statKey=${statKey}`
      );
      const payload = (await response.json()) as {
        data: { available: boolean; reason?: string; isValid?: boolean };
      };

      setOnchainVerify({ loading: false, data: payload.data });
    } catch (error) {
      setOnchainVerify({
        loading: false,
        data: {
          available: false,
          reason:
            error instanceof Error
              ? error.message
              : "Unable to reach the on-chain validation endpoint.",
        },
      });
    }
  }

  const recommendation = getMetaAgentRecommendation(arena);
  const skepticMessage = getSkepticCritique(recommendation, arena);

  return (
    <Card id="agent-arena" className="p-5">
      <SectionHeader
        eyebrow="Agent vs Agent Arena"
        title="Momentum Follower vs Contrarian vs Kelly Criterion"
        action={
          <div className="hidden items-center gap-2 rounded-xl border border-border bg-surface-3 px-3 py-2 sm:flex">
            <Swords className="h-3.5 w-3.5 text-accent-soft" />
            <span className="text-[10px] uppercase tracking-[0.1em] text-stone-400">Live tournament</span>
          </div>
        }
      />
      <p className="-mt-2 mb-5 max-w-3xl text-sm leading-6 text-stone-400">
        Three agents, same live signal feed, three strategies. Contrarian
        fades signals that fire without real field support - a live,
        causal check made at signal-creation time, never the final result.
        Kelly Criterion takes the same side as the signal but sizes its
        stake by an edge derived from confidence score, instead of flat
        staking. Settlement is tamper-evident and on-chain-verified: no
        funds move, no wagers are placed.
      </p>

      {isLoading ? (
        <EmptyState reason="Loading arena scoreboard..." />
      ) : arena ? (
        <>
          <div id="guide-meta-skeptic">
            <div className="mb-4 rounded-2xl border border-accent/15 bg-accent/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
                <Trophy className="h-4 w-4" />
                Meta-agent recommendation
              </div>
              <p className="text-sm leading-6 text-stone-200">{recommendation.message}</p>
            </div>

            {skepticMessage && (
              <div className="mb-4 rounded-2xl border border-danger/15 bg-danger/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-danger">
                  <ShieldQuestion className="h-4 w-4" />
                  Skeptic check
                </div>
                <p className="text-sm leading-6 text-stone-200">{skepticMessage}</p>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ScoreboardCard
              scoreboard={arena.momentumFollower}
              rejections={arena.rejections}
              isLeader={recommendation.agentId === "momentum_follower"}
              onSelectSignalId={onSelectSignalId}
            />
            <ScoreboardCard
              scoreboard={arena.contrarian}
              rejections={arena.rejections}
              isLeader={recommendation.agentId === "contrarian"}
              onSelectSignalId={onSelectSignalId}
            />
            <ScoreboardCard
              scoreboard={arena.kellyCriterion}
              rejections={arena.rejections}
              isLeader={recommendation.agentId === "kelly_criterion"}
              onSelectSignalId={onSelectSignalId}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface-3 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
              <ShieldCheck className="h-4 w-4" />
              Tamper-evident settlement
            </div>
            <p className="mb-3 text-[11px] leading-5 text-stone-400">{arena.proof.note}</p>
            <p className="mb-3 truncate font-mono text-[10px] text-stone-500">Hash: {arena.proof.hash}</p>

            <button
              type="button"
              onClick={runOnchainVerify}
              disabled={onchainVerify.loading || !arena.proof.verifiableStat}
              className="w-full rounded-lg bg-info/10 px-2.5 py-1.5 text-[10px] font-semibold text-info transition hover:bg-info/20 disabled:opacity-50"
            >
              {onchainVerify.loading
                ? "Verifying on Solana…"
                : arena.proof.verifiableStat
                  ? "Verify underlying data on Solana ⛓"
                  : "No settled signal to verify yet"}
            </button>

            {onchainVerify.data && (
              <div className="mt-2 rounded-lg bg-black/30 p-2 text-[10px]">
                {onchainVerify.data.available ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-stone-500">On-chain result</span>
                    <span
                      className={`font-mono font-semibold ${onchainVerify.data.isValid ? "text-positive" : "text-danger"}`}
                    >
                      {onchainVerify.data.isValid ? "PROOF VALID" : "PROOF INVALID"}
                    </span>
                  </div>
                ) : (
                  <p className="text-stone-500">{onchainVerify.data.reason}</p>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <EmptyState reason="Waiting for settled signals to populate the tournament." />
      )}
    </Card>
  );
}
