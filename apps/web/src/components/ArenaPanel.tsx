import { ShieldCheck, Swords, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type ArenaPosition = {
  agentId: "momentum_follower" | "contrarian";
  signalId: string;
  matchId: string;
  match: string;
  side: "home" | "away";
  target: string;
  oddsTaken: number;
  resultStatus: "pending" | "correct" | "incorrect";
  profitUnits: number;
};

type ArenaScoreboard = {
  agentId: "momentum_follower" | "contrarian";
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

type ArenaProof = {
  type: "sha256";
  hash: string;
  verifiableStat: { fixtureId: number; seq: number; statKey: number } | null;
  note: string;
};

type ArenaResponse = {
  momentumFollower: ArenaScoreboard;
  contrarian: ArenaScoreboard;
  proof: ArenaProof;
};

function formatUnits(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function ScoreboardCard({
  scoreboard,
  isLeader,
  accent,
}: {
  scoreboard: ArenaScoreboard;
  isLeader: boolean;
  accent: "sky" | "orange";
}) {
  const accentClass =
    accent === "sky"
      ? "border-sky-400/20 bg-sky-400/10 text-sky-200"
      : "border-orange-400/20 bg-orange-400/10 text-orange-200";

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
          <div
            key={position.signalId}
            className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2 text-[11px]"
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
          </div>
        ))}
        {scoreboard.positions.length === 0 && (
          <p className="text-[11px] text-stone-500">No positions yet.</p>
        )}
      </div>
    </div>
  );
}

export function ArenaPanel() {
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

  const leaderAgentId =
    arena && arena.momentumFollower.netUnits !== arena.contrarian.netUnits
      ? arena.momentumFollower.netUnits > arena.contrarian.netUnits
        ? "momentum_follower"
        : "contrarian"
      : null;

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
            Momentum Follower vs Contrarian
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-400">
            Two agents, same live signal feed, opposite strategies. Contrarian
            fades signals that fire without real field support - a live,
            causal check made at signal-creation time, never the final result.
            Settlement is tamper-evident and on-chain-verified: no funds move,
            no wagers are placed.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-stone-400">
          Loading arena scoreboard...
        </div>
      ) : arena ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ScoreboardCard
              scoreboard={arena.momentumFollower}
              isLeader={leaderAgentId === "momentum_follower"}
              accent="sky"
            />
            <ScoreboardCard
              scoreboard={arena.contrarian}
              isLeader={leaderAgentId === "contrarian"}
              accent="orange"
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
