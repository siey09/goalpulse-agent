import { ShieldCheck, RotateCcw, AlertTriangle, Link2, Users, ListChecks, CheckCircle2, XCircle, Eye, Play } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { StatusCapsule } from "../../components/ui/widgets/StatusCapsule";
import { VerificationReceipt } from "../../components/VerificationReceipt";
import { getSignalTarget } from "../../lib/formatters";
import type { AgentSignal, AnchorProofResult, OnChainVerifyData, ReplayBacktest } from "../../types";

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
  anchorProof: { loading: boolean; result: AnchorProofResult | null };
  onAnchorProof: (hash: string | undefined) => void;
}

/** Visual treatment per reversal-risk tier, keyed off the same field the Failed Continuation Detector already reports. Falls back to the neutral "proof" tone for any unrecognized value. */
const REVERSAL_STYLES: Record<string, string> = {
  EXTREME_REVERSAL: "border-danger/30 bg-danger/15 text-danger-200",
  HIGH_REVERSAL: "border-warning/30 bg-warning/15 text-warning",
  MODERATE_REVERSAL: "border-info/25 bg-info/10 text-info-200",
  NORMAL_WATCH: "border-white/15 bg-white/10 text-stone-300",
  VALIDATED: "border-positive/25 bg-positive/10 text-positive-200",
};

function reversalBadgeClass(risk: string | undefined): string {
  return REVERSAL_STYLES[risk ?? ""] ?? "border-proof/25 bg-proof/10 text-proof-200";
}

function VoteIcon({ vote }: { vote: string }) {
  if (vote === "approve") return <CheckCircle2 className="h-3 w-3" aria-hidden="true" />;
  if (vote === "reject") return <XCircle className="h-3 w-3" aria-hidden="true" />;
  return <Eye className="h-3 w-3" aria-hidden="true" />;
}

/** Small icon-in-circle badge reused across this page's section headers so every panel reads as part of the same visual language instead of inventing its own header style. */
function SectionIcon({ tone, children }: { tone: "accent" | "danger" | "info" | "positive"; children: React.ReactNode }) {
  const toneClass: Record<string, string> = {
    accent: "border-accent/25 bg-accent/10 text-accent-200",
    danger: "border-danger/25 bg-danger/10 text-danger-200",
    info: "border-info/25 bg-info/10 text-info-200",
    positive: "border-positive/25 bg-positive/10 text-positive-200",
  };
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${toneClass[tone]}`}
      aria-hidden="true"
    >
      {children}
    </div>
  );
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
  anchorProof,
  onAnchorProof,
}: ReplayLabPageProps) {
  return (
    <div className="space-y-4">
      <Card id="guide-backtest-card" className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SectionIcon tone="accent">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </SectionIcon>
            <div>
              <p className="text-xs text-stone-500">
                {replayBacktest?.mode === "real_txline_replay" ? "Real TxLINE replay" : "Stored replay"}
              </p>
              <h2 className="text-base font-semibold">Outcome audit mode</h2>
            </div>
          </div>
          <button
            onClick={onRunAudit}
            disabled={isReplayRunning}
            className="flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent-200 transition hover:border-accent-300/40 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-3 w-3" aria-hidden="true" />
            {isReplayRunning ? "Running..." : "Run audit"}
          </button>
        </div>

        {pnl && (
          <div className="mb-3 rounded-xl border border-border bg-black/25 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                Simulated P&amp;L — flat 1 unit per signal
              </p>
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                  pnl.netUnits > 0
                    ? "border-positive/30 bg-positive/10 text-positive-200"
                    : pnl.netUnits < 0
                      ? "border-danger/30 bg-danger/10 text-danger-200"
                      : "border-border bg-white/5 text-stone-300"
                }`}
              >
                {pnl.netUnits > 0 ? "+" : ""}
                {pnl.netUnits.toFixed(2)}u · {pnl.roiPercent > 0 ? "+" : ""}
                {pnl.roiPercent}% ROI
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatusCapsule label="Settled bets" value={pnl.settledBets} tone="neutral" />
              <StatusCapsule label="Total staked" value={`${pnl.totalStaked}u`} tone="neutral" />
              <StatusCapsule label="Open positions" value={pnl.openPositions} tone="warning" />
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
            <div className="grid grid-cols-3 gap-3">
              <StatusCapsule label="Snapshots" value={replayBacktest.summary?.snapshotsProcessed ?? 0} tone="neutral" />
              <StatusCapsule label="Signals" value={replayBacktest.summary?.signalsDetected ?? 0} tone="neutral" />
              <StatusCapsule
                label="Settled checks"
                value={(replayBacktest.summary?.correctSignals ?? 0) + (replayBacktest.summary?.incorrectSignals ?? 0)}
                tone="positive"
              />
            </div>

            <div className="rounded-xl border border-danger/20 bg-danger/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-200" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-danger-200/70">
                      Failed Continuation Detector
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {replayBacktest.summary?.smartMoneyTraps ?? 0} trap pattern(s) detected
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-danger-100">
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
                      className="w-full rounded-lg bg-black/25 p-2 text-left transition hover:bg-danger/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[11px] font-semibold text-white">
                          #{index + 1} · {signal.match ?? signal.matchId ?? "Unknown match"} ·{" "}
                          {getSignalTarget(signal)}
                        </p>
                        <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger-100">
                          Reversal score {signal.trapScore ?? 0}
                        </span>
                      </div>
                      <p
                        className={`mt-1.5 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${reversalBadgeClass(
                          signal.reversalRisk
                        )}`}
                      >
                        {(signal.reversalRisk ?? "REVERSAL_SCAN").replaceAll("_", " ")}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-stone-400">
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
          <Card className="border-positive/15 bg-positive/10 p-3">
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 text-stone-400">
                <ShieldCheck className="h-3.5 w-3.5 text-positive-200" aria-hidden="true" />
                Outcome audit
              </span>
              <span className="font-medium text-positive-200">
                {replayBacktest.summary?.correctSignals ?? 0} confirmed •{" "}
                {replayBacktest.summary?.incorrectSignals ?? 0} rejected
              </span>
            </div>

            <div id="guide-proof-readiness" className="mt-3 rounded-lg bg-black/20 p-2.5">
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg bg-black/25 px-2.5 py-2">
                  <p className="text-stone-500">Proof network</p>
                  <p className="mt-0.5 truncate font-mono font-semibold text-info-200">
                    {replayBacktest.proof?.network ?? "solana-devnet"}
                  </p>
                </div>
                <div className="rounded-lg bg-black/25 px-2.5 py-2">
                  <p className="text-stone-500">Anchoring</p>
                  <p className="mt-0.5 truncate font-mono font-semibold text-accent-200">
                    {(replayBacktest.proof?.anchoringStatus ?? "pending_wallet_configuration").replaceAll("_", " ")}
                  </p>
                </div>
              </div>

              <p className="mt-2 flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 font-mono text-[10px] text-stone-400">
                <span className="shrink-0 text-stone-600">Hash</span>
                <span className="truncate">{replayBacktest.proof?.hash ?? "pending"}</span>
              </p>

              <button
                type="button"
                onClick={() => onAnchorProof(replayBacktest.proof?.hash)}
                disabled={anchorProof.loading || !replayBacktest.proof?.hash}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-info/10 px-3 py-1.5 text-[10px] font-semibold text-info transition-colors hover:bg-info/20 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {anchorProof.loading ? "Anchoring on Solana devnet..." : "Anchor proof on Solana devnet"}
              </button>

              {anchorProof.result && (
                <div className="mt-2 rounded-lg border border-border/70 bg-black/30 p-2 text-[10px]">
                  {anchorProof.result.available ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-stone-500">Devnet anchor</span>
                        <span className="font-mono font-semibold text-positive">ANCHORED</span>
                      </div>
                      <p className="mt-1 truncate text-stone-400">Signature: {anchorProof.result.signature}</p>
                      {anchorProof.result.explorerUrl && (
                        <a
                          href={anchorProof.result.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 flex items-center gap-1.5 text-info underline decoration-info/40 underline-offset-2"
                        >
                          View on Solana Explorer (devnet)
                        </a>
                      )}
                    </>
                  ) : (
                    <p className="leading-4 text-stone-500">{anchorProof.result.reason}</p>
                  )}
                </div>
              )}

              <div className="mt-2">
                <VerificationReceipt selectedSignal={selectedSignal} onchainVerify={onchainVerify} onVerify={onVerify} />
              </div>
            </div>
          </Card>

          {(replayBacktest.events ?? []).length > 0 && (
            <Card id="guide-event-correlation" className="border-accent/15 bg-accent/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <SectionIcon tone="accent">
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </SectionIcon>
                  <div>
                    <p className="text-[10px] text-accent-200/80">Evidence chain</p>
                    <p className="text-xs font-semibold text-white">
                      {(replayBacktest.events ?? []).length} supporting event(s)
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-medium text-accent-100">
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
                      <span className="shrink-0 text-[10px] text-accent-200">{event.minute}'</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">{event.description}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(replayBacktest.councilVotes ?? []).length > 0 && (
            <Card id="guide-oracle-council" className="border-info/15 bg-info/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <SectionIcon tone="info">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  </SectionIcon>
                  <div>
                    <p className="text-[10px] text-info-200/80">Signal review council</p>
                    <p className="text-xs font-semibold text-white">
                      {(replayBacktest.councilVotes ?? [])[0]?.decision?.toUpperCase() ?? "PENDING"}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-medium text-info-100">
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
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                          vote.vote === "approve"
                            ? "bg-positive/10 text-positive-200"
                            : vote.vote === "reject"
                              ? "bg-danger/10 text-danger-200"
                              : "bg-accent/10 text-accent-200"
                        }`}
                      >
                        <VoteIcon vote={vote.vote} />
                        {vote.vote}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">{vote.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-3">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks className="h-3.5 w-3.5 text-stone-500" aria-hidden="true" />
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Replay pipeline</p>
            </div>
            <div className="relative space-y-4 pl-8">
              <div className="absolute bottom-2 left-[10px] top-2 w-px bg-white/10" aria-hidden="true" />
              {(replayBacktest.timeline ?? []).slice(0, 3).map((item, index) => (
                <div key={`${item.step}-${index}`} className="relative">
                  <span className="absolute -left-8 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-accent/30 bg-surface-2 text-[10px] font-bold text-accent-200">
                    {index + 1}
                  </span>
                  <p className="text-[11px] font-semibold text-stone-100">{item.step}</p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </Card>
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
