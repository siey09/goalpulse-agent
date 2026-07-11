import { Card } from "../../components/ui/Card";
import { VerificationReceipt } from "../../components/VerificationReceipt";
import { getSignalTarget } from "../../lib/formatters";
import type { AgentSignal, OnChainVerifyData, ReplayBacktest } from "../../types";

export interface ReplayLabPnl {
  netUnits: number;
  roiPercent: number;
  settledBets: number;
  totalStaked: number;
  openPositions: number;
  note?: string;
}

export interface ReplayLabPageProps {
  replayBacktest: ReplayBacktest | null;
  pnl: ReplayLabPnl | null;
  isReplayRunning: boolean;
  onRunAudit: () => void;
  selectedSignal: AgentSignal | null;
  onSelectSignal: (signal: AgentSignal) => void;
  onchainVerify: Record<string, { loading: boolean; data: OnChainVerifyData | null }>;
  onVerify: (signal: AgentSignal | null) => void;
}

/**
 * The historical TxLINE replay + outcome audit flow, extracted from
 * App.tsx's "Outcome audit mode" card. The Solana verify section renders
 * via the shared VerificationReceipt component (also used by the
 * dedicated Verification page) so both surfaces show identical live
 * verify state rather than two copies that could diverge.
 */
export function ReplayLabPage({
  replayBacktest,
  pnl,
  isReplayRunning,
  onRunAudit,
  selectedSignal,
  onSelectSignal,
  onchainVerify,
  onVerify,
}: ReplayLabPageProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-stone-500">
              {replayBacktest?.mode === "real_txline_replay" ? "Real TxLINE replay" : "Stored replay"}
            </p>
            <h2 className="text-base font-semibold">Outcome audit mode</h2>
          </div>
          <button
            onClick={onRunAudit}
            disabled={isReplayRunning}
            className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-[11px] font-medium text-orange-200 transition hover:border-orange-300/40 hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReplayRunning ? "Running..." : "Run audit"}
          </button>
        </div>

        {pnl && (
          <div className="mb-3 rounded-2xl border border-white/10 bg-black/25 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                Simulated P&amp;L — flat 1 unit per signal
              </p>
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                  pnl.netUnits > 0
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    : pnl.netUnits < 0
                      ? "border-red-400/30 bg-red-400/10 text-red-200"
                      : "border-white/10 bg-white/5 text-stone-300"
                }`}
              >
                {pnl.netUnits > 0 ? "+" : ""}
                {pnl.netUnits.toFixed(2)}u · {pnl.roiPercent > 0 ? "+" : ""}
                {pnl.roiPercent}% ROI
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold tabular-nums text-white">{pnl.settledBets}</p>
                <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Settled bets</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums text-white">{pnl.totalStaked}u</p>
                <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Total staked</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums text-amber-200">{pnl.openPositions}</p>
                <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Open positions</p>
              </div>
            </div>
            <p className="mt-2 text-[9px] leading-4 text-stone-500">{pnl.note}</p>
            <p className="mt-1 text-left text-[9px] leading-4 text-stone-500">
              Based on {pnl.settledBets} settled bet(s) — see Archive for permanently confirmed historical
              examples
            </p>
          </div>
        )}

        {replayBacktest && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-black/20 p-2.5">
                <p className="text-[10px] text-stone-500">Snapshots</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {replayBacktest.summary?.snapshotsProcessed ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-black/20 p-2.5">
                <p className="text-[10px] text-stone-500">Signals</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {replayBacktest.summary?.signalsDetected ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-black/20 p-2.5">
                <p className="text-[10px] text-stone-500">Settled checks</p>
                <p className="mt-1 text-sm font-semibold text-emerald-200">
                  {(replayBacktest.summary?.correctSignals ?? 0) +
                    (replayBacktest.summary?.incorrectSignals ?? 0)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-red-200/70">
                    Failed Continuation Detector
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {replayBacktest.summary?.smartMoneyTraps ?? 0} trap pattern(s) detected
                  </p>
                </div>
                <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-red-100">
                  {replayBacktest.summary?.confirmedTraps ?? 0} rejected •{" "}
                  {replayBacktest.summary?.possibleTraps ?? 0} possible
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-5 text-stone-300">
                GoalPulse checks whether sharp odds movements were later rejected by the final result. This
                helps expose possible false market moves instead of treating every strong move as a good
                signal.
              </p>

              <div className="mt-3 space-y-2">
                {(replayBacktest.signals ?? [])
                  .filter(
                    (signal) =>
                      signal.trapStatus === "OUTCOME_REJECTED_MOVE" || signal.trapStatus === "POSSIBLE_TRAP"
                  )
                  .sort((a, b) => (b.trapScore ?? 0) - (a.trapScore ?? 0))
                  .slice(0, 5)
                  .map((signal, index) => (
                    <button
                      key={`${signal.id ?? "trap"}-${index}`}
                      onClick={() => onSelectSignal(signal)}
                      className="w-full rounded-lg bg-black/25 p-2 text-left transition hover:bg-red-400/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[11px] font-semibold text-white">
                          #{index + 1} · {signal.match ?? signal.matchId ?? "Unknown match"} ·{" "}
                          {getSignalTarget(signal)}
                        </p>
                        <span className="shrink-0 rounded-full bg-red-400/10 px-2 py-0.5 text-[10px] font-semibold text-red-100">
                          Reversal score {signal.trapScore ?? 0}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] font-semibold text-purple-200">
                        {(signal.reversalRisk ?? "REVERSAL_SCAN").replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-400">
                        {signal.trapReason ?? "Rejected market move flagged for review."}
                      </p>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {replayBacktest ? (
        <>
          <Card className="border-emerald-400/15 bg-emerald-400/10 p-3">
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-stone-400">Outcome audit</span>
              <span className="font-medium text-emerald-200">
                {replayBacktest.summary?.correctSignals ?? 0} confirmed •{" "}
                {replayBacktest.summary?.incorrectSignals ?? 0} rejected
              </span>
            </div>

            <div className="mt-3 rounded-lg bg-black/20 p-2">
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-stone-500">Proof network</span>
                <span className="font-medium text-sky-200">{replayBacktest.proof?.network ?? "solana-devnet"}</span>
              </div>

              <div className="mt-1 flex items-center justify-between gap-3 text-[10px]">
                <span className="text-stone-500">Anchoring</span>
                <span className="font-medium text-orange-200">
                  {(replayBacktest.proof?.anchoringStatus ?? "pending_wallet_configuration").replaceAll("_", " ")}
                </span>
              </div>

              <p className="mt-2 truncate text-[10px] text-stone-500">Hash: {replayBacktest.proof?.hash ?? "pending"}</p>

              <div className="mt-2">
                <VerificationReceipt selectedSignal={selectedSignal} onchainVerify={onchainVerify} onVerify={onVerify} />
              </div>
            </div>
          </Card>

          {(replayBacktest.events ?? []).length > 0 && (
            <Card className="border-orange-400/15 bg-orange-400/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] text-orange-200/80">Evidence chain</p>
                  <p className="text-xs font-semibold text-white">
                    {(replayBacktest.events ?? []).length} supporting event(s)
                  </p>
                </div>
                <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-medium text-orange-100">
                  Dual-feed
                </span>
              </div>

              <div className="space-y-2">
                {(replayBacktest.events ?? []).slice(0, 3).map((event, index) => (
                  <div key={event.id ?? index} className="rounded-lg bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-stone-100">
                        {event.type?.replaceAll("_", " ").toUpperCase()}
                      </p>
                      <span className="shrink-0 text-[10px] text-orange-200">{event.minute}'</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">{event.description}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(replayBacktest.councilVotes ?? []).length > 0 && (
            <Card className="border-sky-400/15 bg-sky-400/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] text-sky-200/80">Signal review council</p>
                  <p className="text-xs font-semibold text-white">
                    {(replayBacktest.councilVotes ?? [])[0]?.decision?.toUpperCase() ?? "PENDING"}
                  </p>
                </div>
                <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-medium text-sky-100">
                  {(replayBacktest.councilVotes ?? [])[0]?.approvals ?? 0}/
                  {(replayBacktest.councilVotes ?? [])[0]?.totalAgents ?? 3} approvals
                </span>
              </div>

              <div className="space-y-2">
                {((replayBacktest.councilVotes ?? [])[0]?.votes ?? []).map((vote, index) => (
                  <div key={`${vote.agent}-${index}`} className="rounded-lg bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-stone-100">{vote.agent}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                          vote.vote === "approve"
                            ? "bg-emerald-400/10 text-emerald-200"
                            : vote.vote === "reject"
                              ? "bg-red-400/10 text-red-200"
                              : "bg-orange-400/10 text-orange-200"
                        }`}
                      >
                        {vote.vote}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">{vote.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="space-y-2">
            {(replayBacktest.timeline ?? []).slice(0, 3).map((item, index) => (
              <div key={`${item.step}-${index}`} className="rounded-xl bg-black/20 p-2.5">
                <p className="text-[11px] font-semibold text-stone-100">
                  {index + 1}. {item.step}
                </p>
                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[11px] leading-5 text-stone-500">
          Replay a saved World Cup odds sequence through the same signal engine to prove the logic still works
          even when real-time matches are unavailable.
        </p>
      )}
    </div>
  );
}
