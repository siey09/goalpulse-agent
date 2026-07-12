import { SignalIntelligencePanel } from "../../components/SignalIntelligencePanel";
import { SteamMoveDetectionPanel } from "../../components/SteamMoveDetectionPanel";
import { SignalCorrelationPanel } from "../../components/SignalCorrelationPanel";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { formatOdds, formatOddsChange, formatTime, getSignalOutcome, getSignalTarget, signalTypeLabel, getSignalType } from "../../lib/formatters";
import type { AgentSignal } from "../../types";

export interface OutcomeVerificationItem {
  signal: AgentSignal;
  source: string;
  proofHash?: string;
}

export interface SignalsPageProps {
  outcomeVerificationItems: OutcomeVerificationItem[];
  onSelectSignal: (signal: AgentSignal) => void;
}

/**
 * Composes three already-separate, self-fetching panels, plus the
 * per-signal "Outcome verification" card (Before/After/Move + proof-hash
 * preview) extracted from App.tsx - it's signal-level audit evidence,
 * so it belongs here rather than on Live Markets (fixture-level) or
 * Verification (which is specifically the Solana on-chain check).
 */
export function SignalsPage({ outcomeVerificationItems, onSelectSignal }: SignalsPageProps) {
  return (
    <div className="space-y-4">
      <SignalIntelligencePanel />
      <SteamMoveDetectionPanel />
      <SignalCorrelationPanel />

      <Card id="guide-outcome-verification" className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone-500">Post-signal audit</p>
            <h2 className="font-display text-xl font-bold tracking-tight text-white">Outcome verification</h2>
          </div>
          <span className="rounded-full border border-positive/20 bg-positive/10 px-3 py-1.5 text-[11px] font-medium text-positive-200">
            Verifiable
          </span>
        </div>

        {outcomeVerificationItems.length > 0 ? (
          <div className="space-y-2">
            {outcomeVerificationItems.map((item, index) => {
              const outcome = getSignalOutcome(item.signal);
              const isCorrect = outcome.toLowerCase().includes("correct");
              const isIncorrect = outcome.toLowerCase().includes("incorrect");
              const proofPreview = item.proofHash
                ? `${item.proofHash.slice(0, 12)}...${item.proofHash.slice(-6)}`
                : "pending";

              return (
                <button
                  key={`${item.source}-${item.signal.id ?? index}`}
                  onClick={() => onSelectSignal(item.signal)}
                  className="w-full rounded-xl border border-white/8 bg-black/20 p-3 text-left transition hover:border-positive/30 hover:bg-positive/10"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {signalTypeLabel(getSignalType(item.signal))}
                      </p>
                      <p className="mt-0.5 text-[11px] text-stone-500">
                        {item.source} • {getSignalTarget(item.signal)}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        isCorrect
                          ? "border-positive/30 bg-positive/10 text-positive-200"
                          : isIncorrect
                            ? "border-danger/30 bg-danger/10 text-danger-200"
                            : "border-accent/30 bg-accent/10 text-accent-200"
                      }`}
                    >
                      {outcome}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg bg-black/25 p-2">
                      <p className="text-stone-500">Before</p>
                      <p className="mt-1 font-semibold text-stone-100">{formatOdds(item.signal.oddsBefore)}</p>
                    </div>
                    <div className="rounded-lg bg-black/25 p-2">
                      <p className="text-stone-500">After</p>
                      <p className="mt-1 font-semibold text-stone-100">{formatOdds(item.signal.oddsAfter)}</p>
                    </div>
                    <div className="rounded-lg bg-black/25 p-2">
                      <p className="text-stone-500">Move</p>
                      <p className="mt-1 font-semibold text-accent-200">{formatOddsChange(item.signal.oddsChangePct)}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-stone-500">
                    <span>Proof: {proofPreview}</span>
                    <span>{formatTime(item.signal.createdAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState reason="Run the backtest or wait for live signals to verify outcomes." />
        )}
      </Card>
    </div>
  );
}
