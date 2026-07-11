import { ShieldCheck, ShieldQuestion, Swords, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type ArenaAgentId = "momentum_follower" | "contrarian" | "kelly_criterion";

type ArenaPosition = {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  match: string;
  side: "home" | "away" | "draw";
  target: string;
  oddsTaken: number;
  stakeUnits: number;
  resultStatus: "pending" | "correct" | "incorrect";
  profitUnits: number;
};

type ArenaScoreboard = {
  agentId: ArenaAgentId;
  label: string;
  positions: ArenaPosition[];
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  winRatePct: number;
  netUnits: number;
  roiPercent: number;
  openPositions: number;
};

type ArenaRejection = {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  reason:
    | "totals_signal"
    | "not_market_only_move"
    | "no_original_snapshot"
    | "draw_signal"
    | "risk_limit_exceeded";
  reasonText: string;
};

type ArenaProof = {
  type: "sha256";
  hash: string;
  verifiableStat: { fixtureId: number; seq: number; statKey: number } | null;
  note: string;
};

type ArenaResponse = {
  momentumFollower: ArenaScoreboard;
  contrarian: ArenaScoreboard;
  kellyCriterion: ArenaScoreboard;
  rejections: ArenaRejection[];
  proof: ArenaProof;
};

function formatUnits(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
}

const MIN_SETTLED_FOR_RANKING = 5;
const NARROW_MARGIN_THRESHOLD_PCT = 10;

const STRATEGY_MECHANISM: Record<ArenaAgentId, string> = {
  momentum_follower: "takes every signal at face value",
  contrarian: "fades signals that fire without real field support",
  kelly_criterion: "sizes stakes by the model's own confidence score instead of betting flat",
};

type MetaAgentRecommendation = {
  agentId: ArenaAgentId | null;
  message: string;
};

function formatRoi(value: number) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function getMetaAgentRecommendation(arena: ArenaResponse | null): MetaAgentRecommendation {
  if (!arena) {
    return { agentId: null, message: "Waiting for arena data." };
  }

  const scoreboards = [arena.momentumFollower, arena.contrarian, arena.kellyCriterion];
  const qualifying = scoreboards.filter((s) => s.settledCount >= MIN_SETTLED_FOR_RANKING);

  if (qualifying.length < 2) {
    return {
      agentId: null,
      message: "Not enough settled positions yet to recommend a leading strategy.",
    };
  }

  const sorted = [...qualifying].sort((a, b) => b.roiPercent - a.roiPercent);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const margin = leader.roiPercent - runnerUp.roiPercent;
  const isNarrow = margin < NARROW_MARGIN_THRESHOLD_PCT;

  const marginText = isNarrow
    ? `a narrow lead over ${runnerUp.label} (${formatRoi(runnerUp.roiPercent)}) — worth revisiting as more signals settle`
    : `a clear lead over ${runnerUp.label} (${formatRoi(runnerUp.roiPercent)})`;

  return {
    agentId: leader.agentId,
    message: `${leader.label} currently leads on ROI at ${formatRoi(leader.roiPercent)} over ${leader.settledCount} settled positions — ${marginText}. It ${STRATEGY_MECHANISM[leader.agentId]}.`,
  };
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

function ScoreboardCard({
  scoreboard,
  rejections,
  isLeader,
  accent,
  onSelectSignalId,
}: {
  scoreboard: ArenaScoreboard;
  rejections: ArenaRejection[];
  isLeader: boolean;
  accent: "sky" | "orange" | "violet";
  onSelectSignalId?: (signalId: string) => void;
}) {
  // Defensive: rejections may be absent from an older backend response
  // (e.g. during this project's documented Render deploy-lag window,
  // where a newly-deployed frontend can briefly talk to a not-yet-updated
  // backend) - never let a shape mismatch crash the whole panel.
  const agentRejections = (rejections ?? []).filter((r) => r.agentId === scoreboard.agentId);
  const distinctReasons = Array.from(new Set(agentRejections.map((r) => r.reasonText))).slice(0, 3);
  const accentClass =
    accent === "sky"
      ? "border-sky-400/20 bg-sky-400/10 text-sky-200"
      : accent === "orange"
        ? "border-orange-400/20 bg-orange-400/10 text-orange-200"
        : "border-violet-400/20 bg-violet-400/10 text-violet-200";

  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{scoreboard.label}</h3>
        {isLeader && (
          <span className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
            <Trophy className="h-3 w-3" />
            Leading
          </span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className={`rounded-2xl border p-3 ${accentClass}`}>
          <p className="text-[9px] uppercase tracking-[0.14em] opacity-80">Net units</p>
          <p className="mt-1 text-xl font-bold">{formatUnits(scoreboard.netUnits)}</p>
        </div>
        <div className={`rounded-2xl border p-3 ${accentClass}`}>
          <p className="text-[9px] uppercase tracking-[0.14em] opacity-80">ROI</p>
          <p className="mt-1 text-xl font-bold">
            {scoreboard.roiPercent > 0 ? "+" : ""}
            {scoreboard.roiPercent}%
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-xl bg-[#0b0806] p-2">
          <p className="text-stone-500">Win rate</p>
          <p className="mt-1 font-semibold text-white">{scoreboard.winRatePct}%</p>
        </div>
        <div className="rounded-xl bg-[#0b0806] p-2">
          <p className="text-stone-500">Settled</p>
          <p className="mt-1 font-semibold text-white">{scoreboard.settledCount}</p>
        </div>
        <div className="rounded-xl bg-[#0b0806] p-2">
          <p className="text-stone-500">Open</p>
          <p className="mt-1 font-semibold text-white">{scoreboard.openPositions}</p>
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
              className={`shrink-0 font-semibold ${
                position.resultStatus === "correct"
                  ? "text-emerald-300"
                  : position.resultStatus === "incorrect"
                    ? "text-rose-300"
                    : "text-amber-300"
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
        <div className="mt-3 border-t border-white/5 pt-3">
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
    </div>
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
    <section
      id="agent-arena"
      className="rounded-[28px] border border-amber-400/20 bg-gradient-to-br from-[#160f08] via-[#120d0a] to-[#070706] p-5 shadow-2xl shadow-amber-950/20"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
            <Swords className="h-4 w-4" />
            Agent vs Agent Arena
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Momentum Follower vs Contrarian vs Kelly Criterion
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-400">
            Three agents, same live signal feed, three strategies. Contrarian
            fades signals that fire without real field support - a live,
            causal check made at signal-creation time, never the final result.
            Kelly Criterion takes the same side as the signal but sizes its
            stake by an edge derived from confidence score, instead of flat
            staking. Settlement is tamper-evident and on-chain-verified: no
            funds move, no wagers are placed.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-stone-400">
          Loading arena scoreboard...
        </div>
      ) : arena ? (
        <>
          <div id="guide-meta-skeptic">
            <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                <Trophy className="h-4 w-4" />
                Meta-agent recommendation
              </div>
              <p className="text-sm leading-6 text-stone-200">{recommendation.message}</p>
            </div>

            {skepticMessage && (
              <div className="mb-4 rounded-2xl border border-rose-400/15 bg-rose-400/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
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
              accent="sky"
              onSelectSignalId={onSelectSignalId}
            />
            <ScoreboardCard
              scoreboard={arena.contrarian}
              rejections={arena.rejections}
              isLeader={recommendation.agentId === "contrarian"}
              accent="orange"
              onSelectSignalId={onSelectSignalId}
            />
            <ScoreboardCard
              scoreboard={arena.kellyCriterion}
              rejections={arena.rejections}
              isLeader={recommendation.agentId === "kelly_criterion"}
              accent="violet"
              onSelectSignalId={onSelectSignalId}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
              <ShieldCheck className="h-4 w-4" />
              Tamper-evident settlement
            </div>
            <p className="mb-3 text-[11px] leading-5 text-stone-400">{arena.proof.note}</p>
            <p className="mb-3 truncate text-[10px] text-stone-500">Hash: {arena.proof.hash}</p>

            <button
              type="button"
              onClick={runOnchainVerify}
              disabled={onchainVerify.loading || !arena.proof.verifiableStat}
              className="w-full rounded-lg bg-sky-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-50"
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
                      className={`font-semibold ${onchainVerify.data.isValid ? "text-emerald-300" : "text-rose-300"}`}
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
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-stone-400">
          Waiting for settled signals to populate the tournament.
        </div>
      )}
    </section>
  );
}
