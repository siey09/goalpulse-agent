import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { VerificationReceipt } from "../VerificationReceipt";
import { StatusBadge } from "../ui/StatusBadge";
import {
  formatOdds,
  formatOddsChange,
  formatProbabilityPointShift,
  formatTime,
  getSignalOutcome,
  getSignalTarget,
  getSignalType,
  getThresholdLabel,
  impliedProbabilityPct,
  reliabilityTone,
  signalTypeLabel,
} from "../../lib/formatters";
import type { AgentSignal, Match, OnChainVerifyData, SimilarSignalsResult } from "../../types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type ArenaAgentId = "momentum_follower" | "contrarian" | "kelly_criterion";

type ArenaPositionMatch = {
  agentLabel: string;
  side: string;
  oddsTaken: number;
  stakeUnits: number;
  resultStatus: "pending" | "correct" | "incorrect";
  profitUnits: number;
};

type ArenaRejectionMatch = {
  agentLabel: string;
  reasonText: string;
};

const AGENT_LABELS: Record<ArenaAgentId, string> = {
  momentum_follower: "Momentum Follower",
  contrarian: "Contrarian",
  kelly_criterion: "Kelly Criterion",
};

type ArenaApiResponse = {
  momentumFollower: { positions: Array<Record<string, unknown>> };
  contrarian: { positions: Array<Record<string, unknown>> };
  kellyCriterion: { positions: Array<Record<string, unknown>> };
  rejections: Array<{ agentId: ArenaAgentId; signalId: string; reasonText: string }>;
};

function findStrategyDecisions(arena: ArenaApiResponse | null, signalId: string | undefined) {
  if (!arena || !signalId) return { traded: [] as ArenaPositionMatch[], rejected: [] as ArenaRejectionMatch[] };

  const scoreboards: Array<[ArenaAgentId, Array<Record<string, unknown>>]> = [
    ["momentum_follower", arena.momentumFollower.positions],
    ["contrarian", arena.contrarian.positions],
    ["kelly_criterion", arena.kellyCriterion.positions],
  ];

  const traded: ArenaPositionMatch[] = [];
  for (const [agentId, positions] of scoreboards) {
    const match = positions.find((position) => position.signalId === signalId);
    if (match) {
      traded.push({
        agentLabel: AGENT_LABELS[agentId],
        side: String(match.side ?? "—"),
        oddsTaken: Number(match.oddsTaken ?? 0),
        stakeUnits: Number(match.stakeUnits ?? 0),
        resultStatus: (match.resultStatus as "pending" | "correct" | "incorrect") ?? "pending",
        profitUnits: Number(match.profitUnits ?? 0),
      });
    }
  }

  const rejected = arena.rejections
    .filter((rejection) => rejection.signalId === signalId)
    .map((rejection) => ({ agentLabel: AGENT_LABELS[rejection.agentId], reasonText: rejection.reasonText }));

  return { traded, rejected };
}

export interface SignalAuditDrawerProps {
  signal: AgentSignal | null;
  match?: Match;
  onClose: () => void;
  onchainVerify: Record<string, { loading: boolean; data: OnChainVerifyData | null }>;
  onVerify: (signal: AgentSignal | null) => void;
  similarSignals: SimilarSignalsResult | null;
  isSimilarSignalsLoading: boolean;
  /** Audit-run SHA-256 fingerprint, if this signal was part of a replay run - never a per-signal hash. */
  proofHash?: string;
}

/**
 * The reusable "Signal Audit Drawer" from the redesign blueprint: a
 * single component that can open from any chart, card, or table across
 * the Command Center, showing everything the blueprint requires -
 * including fields the old default-page modal never had (implied
 * probability, percentage-point shift, per-strategy Arena decisions,
 * and the same live Solana verify state used everywhere else via
 * VerificationReceipt).
 */
export function SignalAuditDrawer({
  signal,
  match,
  onClose,
  onchainVerify,
  onVerify,
  similarSignals,
  isSimilarSignalsLoading,
  proofHash,
}: SignalAuditDrawerProps) {
  const [arena, setArena] = useState<ArenaApiResponse | null>(null);
  const [isArenaLoading, setIsArenaLoading] = useState(false);

  useEffect(() => {
    if (!signal?.id) return;

    let cancelled = false;
    // Immediate loading flag before the fetch settles - same accepted pattern as
    // the similarSignals effect in App.tsx (isSimilarSignalsLoading).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsArenaLoading(true);

    fetch(`${API_BASE_URL}/api/arena`)
      .then((response) => response.json())
      .then((payload: { data?: ArenaApiResponse }) => {
        if (!cancelled) setArena(payload.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setArena(null);
      })
      .finally(() => {
        if (!cancelled) setIsArenaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signal?.id]);

  const isOpen = Boolean(signal);
  const scoresContext = signal?.evidence?.scoresContext;
  const { traded, rejected } = findStrategyDecisions(arena, signal?.id);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-border bg-surface-1 p-4 shadow-2xl shadow-black/50 transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {signal && (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone-500">Signal audit</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-white">
                  {signalTypeLabel(getSignalType(signal))}
                </h2>
                <p className="mt-1 text-xs text-stone-400">
                  {match ? `${match.homeTeam} vs ${match.awayTeam}` : signal.match ?? signal.matchId ?? "Unknown match"}
                  {" · "}
                  {getSignalTarget(signal)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close signal audit"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/8 text-stone-400 transition hover:bg-white/12 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <StatusBadge label={(signal.severity ?? "LOW").toUpperCase()} tone={signal.severity === "HIGH" ? "danger" : signal.severity === "MEDIUM" ? "warning" : "positive"} />
              <StatusBadge label={formatTime(signal.createdAt)} />
              <StatusBadge label={getSignalOutcome(signal)} />
            </div>

            <div className="mb-4 rounded-xl border border-border bg-black/25 p-4">
              <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-stone-400">Odds &amp; probability</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-black/25 p-3">
                  <p className="text-stone-500">Opening odds</p>
                  <p className="mt-1 font-semibold text-stone-100">{formatOdds(signal.oddsBefore)}</p>
                </div>
                <div className="rounded-xl bg-black/25 p-3">
                  <p className="text-stone-500">Current odds</p>
                  <p className="mt-1 font-semibold text-stone-100">{formatOdds(signal.oddsAfter)}</p>
                </div>
                <div className="rounded-xl bg-black/25 p-3">
                  <p className="text-stone-500">Opening implied probability</p>
                  <p className="mt-1 font-semibold text-stone-100">{impliedProbabilityPct(signal.oddsBefore)}</p>
                </div>
                <div className="rounded-xl bg-black/25 p-3">
                  <p className="text-stone-500">Current implied probability</p>
                  <p className="mt-1 font-semibold text-stone-100">{impliedProbabilityPct(signal.oddsAfter)}</p>
                </div>
                <div className="rounded-xl bg-black/25 p-3">
                  <p className="text-stone-500">Odds compression</p>
                  <p className="mt-1 font-semibold text-accent-200">{formatOddsChange(signal.oddsChangePct)}</p>
                </div>
                <div className="rounded-xl bg-black/25 p-3">
                  <p className="text-stone-500">Probability shift</p>
                  <p className="mt-1 font-semibold text-accent-200">{formatProbabilityPointShift(signal.probabilityPointShiftPct)}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-stone-500">
                Probability shift is a separate percentage-point measure of implied probability, not the same
                quantity as the raw odds-compression percentage above.
              </p>
            </div>

            <div className="mb-4 rounded-xl border border-border bg-black/25 p-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-stone-400">Deterministic threshold</p>
              <p className="text-xs leading-5 text-stone-300">{getThresholdLabel(signal)}</p>
            </div>

            <div className="mb-4 rounded-xl border border-border bg-black/25 p-4">
              <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-stone-400">
                Field &amp; score context
              </p>
              {scoresContext ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-black/25 p-3">
                    <p className="text-stone-500">Scoreline</p>
                    <p className="mt-1 font-semibold text-stone-100">{scoresContext.scoreline ?? "—"}</p>
                  </div>
                  <div className="rounded-xl bg-black/25 p-3">
                    <p className="text-stone-500">Minute</p>
                    <p className="mt-1 font-semibold text-stone-100">
                      {scoresContext.minute != null ? `${scoresContext.minute}'` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-black/25 p-3">
                    <p className="text-stone-500">Sequence</p>
                    <p className="mt-1 font-semibold text-stone-100">{scoresContext.sequence ?? "—"}</p>
                  </div>
                  <div className="rounded-xl bg-black/25 p-3">
                    <p className="text-stone-500">Field pressure score</p>
                    <p className="mt-1 font-semibold text-stone-100">{scoresContext.fieldPressureScore ?? "—"}</p>
                  </div>
                  <div className="col-span-2 flex items-center justify-between rounded-xl bg-black/25 p-3">
                    <p className="text-stone-500">Reliability</p>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${reliabilityTone(scoresContext.reliability)}`}
                    >
                      {scoresContext.reliability ?? "UNKNOWN"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-stone-500">
                  No matching TXODDS Scores event context was available - this is treated as a market-only
                  movement, not a field-backed one.
                </p>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-border bg-black/25 p-4">
              <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-stone-400">
                Strategy decisions
              </p>
              {isArenaLoading ? (
                <p className="text-xs text-stone-500">Checking Agent Arena...</p>
              ) : traded.length === 0 && rejected.length === 0 ? (
                <p className="text-xs text-stone-500">Not yet evaluated by any Arena strategy.</p>
              ) : (
                <div className="space-y-2">
                  {traded.map((position) => (
                    <div key={position.agentLabel} className="rounded-xl bg-black/25 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-stone-100">{position.agentLabel}</p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            position.resultStatus === "correct"
                              ? "border-positive/30 bg-positive/10 text-positive-200"
                              : position.resultStatus === "incorrect"
                                ? "border-danger/30 bg-danger/10 text-danger-200"
                                : "border-accent/30 bg-accent/10 text-accent-200"
                          }`}
                        >
                          {position.resultStatus.toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-stone-500">
                        Took {position.side} at {formatOdds(position.oddsTaken)} · stake {position.stakeUnits.toFixed(2)}u
                        {" · "}
                        {position.profitUnits > 0 ? "+" : ""}
                        {position.profitUnits.toFixed(2)}u
                      </p>
                    </div>
                  ))}
                  {rejected.map((rejection) => (
                    <div key={rejection.agentLabel} className="rounded-xl bg-black/25 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-stone-100">{rejection.agentLabel}</p>
                        <span className="rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-stone-400">
                          NOT TRADED
                        </span>
                      </div>
                      <p className="mt-1 text-stone-500">{rejection.reasonText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-border bg-black/25 p-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-stone-400">Agent explanation</p>
              <p className="text-sm leading-6 text-stone-200">
                {signal.explanation ??
                  signal.reason ??
                  "The agent detected meaningful market movement based on the current odds snapshot and prior movement history."}
              </p>
            </div>

            <div className="mb-4 rounded-xl border border-border bg-black/25 p-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-stone-400">Local audit fingerprint</p>
              <p className="text-xs leading-5 text-stone-300">
                {proofHash
                  ? `SHA-256: ${proofHash.slice(0, 16)}...${proofHash.slice(-8)}`
                  : "This signal has not yet been included in a fingerprinted audit run."}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-stone-500">
                A hash of the full audit dataset, computed locally - tamper-evident only if compared against
                another copy, never itself posted to Solana.
              </p>
            </div>

            <div className="mb-4 rounded-xl border border-info/15 bg-info/10 p-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-info-200/70">
                Solana / Merkle validation
              </p>
              <VerificationReceipt selectedSignal={signal} onchainVerify={onchainVerify} onVerify={onVerify} />
            </div>

            <div className="mb-4 rounded-xl border border-border bg-black/20 p-4">
              <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-stone-400">Historical precedent</p>
              <h3 className="text-sm font-semibold text-white">Similar past signals</h3>

              {isSimilarSignalsLoading ? (
                <p className="mt-3 text-xs text-stone-400">Checking historical precedent...</p>
              ) : !similarSignals || similarSignals.count < 3 ? (
                <p className="mt-3 text-xs text-stone-400">Not enough similar past signals yet.</p>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-5 text-stone-300">
                    {similarSignals.correctCount} of {similarSignals.count} similar past signals resolved
                    correct ({similarSignals.accuracyPct}%).
                  </p>
                  <div className="mt-3 space-y-2">
                    {similarSignals.signals.map((entry, index) => (
                      <div
                        key={`${entry.matchId ?? "match"}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-black/25 p-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-stone-100">Match {entry.matchId ?? "Unknown"}</p>
                          <p className="mt-0.5 text-stone-500">
                            {formatOddsChange(entry.oddsChangePct)} compression ·{" "}
                            {entry.fieldPressureScore != null ? `${entry.fieldPressureScore} field pressure` : "no field pressure"}
                            {" · "}
                            {formatTime(entry.archivedAt)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            entry.resultStatus === "correct"
                              ? "border-positive/30 bg-positive/10 text-positive-200"
                              : "border-danger/30 bg-danger/10 text-danger-200"
                          }`}
                        >
                          {(entry.resultStatus ?? "unknown").toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
