import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { VerificationReceipt } from "../../components/VerificationReceipt";
import type { AgentSignal, OnChainVerifyData } from "../../types";

export interface VerificationPageProps {
  selectedSignal: AgentSignal | null;
  onchainVerify: Record<string, { loading: boolean; data: OnChainVerifyData | null }>;
  onVerify: (signal: AgentSignal | null) => void;
}

/**
 * Renders the exact same live verify state as Replay Lab's own embedded
 * copy (both consume VerificationReceipt) - deliberately not a thinner
 * "how to verify" explainer, per the project's own precedent of two UI
 * surfaces silently diverging (Kelly Criterion frontend wiring,
 * guideTargets drift) being a real, repeated risk worth avoiding.
 */
export function VerificationPage({ selectedSignal, onchainVerify, onVerify }: VerificationPageProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader eyebrow="Trust" title="Verification Objects" />
        <div className="space-y-2 text-xs text-stone-400">
          <p>
            <span className="font-semibold text-stone-200">Local audit fingerprint</span> — a SHA-256 hash of
            the full audit dataset, computed locally. Tamper-evident only if compared against another copy;
            never itself posted to Solana.
          </p>
          <p>
            <span className="font-semibold text-stone-200">Solana-anchored Merkle validation</span> — a real,
            independent on-chain check confirming the underlying TxLINE stat is genuinely anchored on Solana
            mainnet. Covers the source data, not any local ledger hash.
          </p>
          <p>
            <span className="font-semibold text-stone-200">Simulation receipt</span> — entry odds, units, risk
            checks, and settlement result for a paper position. Never a real trade.
          </p>
          <p>
            <span className="font-semibold text-stone-200">Not currently verifiable</span> — the exact reason,
            never inferred or fabricated, when a signal has no on-chain sequence to check.
          </p>
        </div>
      </Card>

      <Card id="guide-verification-receipt" className="p-4">
        <SectionHeader eyebrow="Solana mainnet" title="Verify a Signal" />
        <p className="mb-3 text-xs text-stone-500">
          Select a signal from Signals or Live Markets, then verify it here.
        </p>
        <VerificationReceipt selectedSignal={selectedSignal} onchainVerify={onchainVerify} onVerify={onVerify} />
      </Card>
    </div>
  );
}
