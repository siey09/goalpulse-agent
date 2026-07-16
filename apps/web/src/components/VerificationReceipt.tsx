import { ExternalLink, ShieldCheck } from "lucide-react";
import { getOnchainVerifyTarget, getVerificationDepth } from "../lib/verification";
import type { AgentSignal, OnChainVerifyData } from "../types";

export interface VerificationReceiptProps {
  selectedSignal: AgentSignal | null;
  onchainVerify: Record<string, { loading: boolean; data: OnChainVerifyData | null }>;
  onVerify: (signal: AgentSignal | null) => void;
  variant?: "compact" | "workspace";
}

/**
 * The shared live Solana mainnet Merkle proof check. Compact mode remains
 * suitable for Replay Lab and audit drawers; workspace mode gives the
 * dedicated verification destination stronger hierarchy and touch targets.
 */
export function VerificationReceipt({
  selectedSignal,
  onchainVerify,
  onVerify,
  variant = "compact",
}: VerificationReceiptProps) {
  const target = getOnchainVerifyTarget(selectedSignal);
  const verifyKey = target ? `${target.fixtureId}-${target.sequence}` : null;
  const verifyEntry = (verifyKey && onchainVerify[verifyKey]) || {
    loading: false,
    data: null as OnChainVerifyData | null,
  };
  const depth = getVerificationDepth(selectedSignal, onchainVerify);
  const isWorkspace = variant === "workspace";

  const toneClass = depth
    ? depth.tone === "success"
      ? "border-positive/30 bg-positive/10 text-positive"
      : depth.tone === "danger"
        ? "border-danger/30 bg-danger/10 text-danger"
        : depth.tone === "warn"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border bg-surface-3 text-stone-400"
    : "";

  return (
    <div
      data-testid="verification-receipt"
      data-variant={variant}
      className={`rounded-xl border border-border bg-surface-3 ${isWorkspace ? "p-4 text-xs" : "p-2 text-[10px]"}`}
    >
      {depth && (
        <span className={`mb-2 inline-block rounded-full border px-2.5 py-1 text-[10px] font-semibold ${toneClass}`}>
          {depth.label}
        </span>
      )}

      <button
        type="button"
        onClick={() => onVerify(selectedSignal)}
        disabled={verifyEntry.loading || !target}
        className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-info/10 px-3 font-semibold text-info transition-colors hover:bg-info/20 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
          isWorkspace ? "min-h-11 text-xs" : "py-1.5 text-[10px]"
        }`}
      >
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        {verifyEntry.loading
          ? "Verifying on Solana..."
          : target
            ? `Verify ${selectedSignal?.match ?? "this signal"} on Solana`
            : "Verify on Solana"}
      </button>

      {!target && (
        <p className={`mt-2 leading-5 text-stone-500 ${isWorkspace ? "text-xs" : "text-[10px]"}`}>
          {selectedSignal
            ? "This signal has no TXODDS sequence data to verify."
            : "Select a signal to verify it on Solana."}
        </p>
      )}

      {verifyEntry.data && (
        <div className={`mt-3 rounded-lg border border-border/70 bg-black/30 ${isWorkspace ? "p-3 text-xs" : "p-2 text-[10px]"}`}>
          {verifyEntry.data.available ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-stone-500">On-chain result</span>
                <span className={`font-mono font-semibold ${verifyEntry.data.isValid ? "text-positive" : "text-danger"}`}>
                  {verifyEntry.data.isValid ? "PROOF VALID" : "PROOF FAILED"}
                </span>
              </div>
              {verifyEntry.data.provenStat && (
                <p className="mt-2 text-stone-400">
                  Proven stat: key {verifyEntry.data.provenStat.key}, value{" "}
                  {verifyEntry.data.provenStat.value}, period {verifyEntry.data.provenStat.period}
                </p>
              )}
              {verifyEntry.data.dailyScoresPda && (
                <a
                  href={`https://explorer.solana.com/address/${verifyEntry.data.dailyScoresPda}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View PDA on Solana Explorer"
                  className="mt-2 flex items-center gap-1.5 truncate text-info underline decoration-info/40 underline-offset-2"
                >
                  View PDA on Solana Explorer
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </>
          ) : (
            <p className="leading-5 text-stone-500">
              {verifyEntry.data.reason ?? "On-chain validation unavailable."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
