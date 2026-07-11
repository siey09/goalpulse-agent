import type { AgentSignal, OnChainVerifyData } from "../types";
import { getOnchainVerifyTarget, getVerificationDepth } from "../lib/verification";

export interface VerificationReceiptProps {
  selectedSignal: AgentSignal | null;
  onchainVerify: Record<string, { loading: boolean; data: OnChainVerifyData | null }>;
  onVerify: (signal: AgentSignal | null) => void;
}

/**
 * The one real "Verify on Solana" mechanism in the app - a live mainnet
 * Merkle proof check for whichever signal is currently selected,
 * independent of whether a replay backtest has ever been run. Rendered
 * from both Replay Lab (where it originally lived, inline) and the
 * dedicated Verification destination, so both surfaces show the exact
 * same live verify state instead of two copies that could silently
 * diverge - this project has already shipped bugs from that exact
 * pattern twice (Kelly Criterion frontend wiring, guideTargets drift).
 */
export function VerificationReceipt({ selectedSignal, onchainVerify, onVerify }: VerificationReceiptProps) {
  const target = getOnchainVerifyTarget(selectedSignal);
  const verifyKey = target ? `${target.fixtureId}-${target.sequence}` : null;
  const verifyEntry = (verifyKey && onchainVerify[verifyKey]) || {
    loading: false,
    data: null as OnChainVerifyData | null,
  };
  const depth = getVerificationDepth(selectedSignal, onchainVerify);

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
    <div className="rounded-xl border border-border bg-surface-3 p-2 text-[10px]">
      {depth && (
        <span className={`mb-2 inline-block rounded-full border px-2.5 py-1 text-[10px] font-semibold ${toneClass}`}>
          {depth.label}
        </span>
      )}
      <button
        type="button"
        onClick={() => onVerify(selectedSignal)}
        disabled={verifyEntry.loading || !target}
        className="mt-2 w-full rounded-lg bg-info/10 px-2.5 py-1.5 text-[10px] font-semibold text-info transition hover:bg-info/20 disabled:opacity-50"
      >
        {verifyEntry.loading
          ? "Verifying on Solana…"
          : target
            ? `Verify ${selectedSignal?.match ?? "this signal"} on Solana ⛓`
            : "Verify on Solana ⛓"}
      </button>
      {!target && (
        <p className="mt-1.5 text-[10px] leading-4 text-stone-500">
          {selectedSignal
            ? "This signal has no TXODDS sequence data to verify."
            : "Select a signal to verify it on Solana."}
        </p>
      )}

      {verifyEntry.data && (
        <div className="mt-2 rounded-lg bg-black/30 p-2 text-[10px]">
          {verifyEntry.data.available ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-stone-500">On-chain result</span>
                <span
                  className={`font-mono font-semibold ${verifyEntry.data.isValid ? "text-positive" : "text-danger"}`}
                >
                  {verifyEntry.data.isValid ? "PROOF VALID" : "PROOF FAILED"}
                </span>
              </div>
              {verifyEntry.data.provenStat && (
                <p className="mt-1 text-stone-500">
                  Proven stat: key {verifyEntry.data.provenStat.key}, value{" "}
                  {verifyEntry.data.provenStat.value}, period {verifyEntry.data.provenStat.period}
                </p>
              )}
              {verifyEntry.data.dailyScoresPda && (
                <a
                  href={`https://explorer.solana.com/address/${verifyEntry.data.dailyScoresPda}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-info underline"
                >
                  View PDA on Solana Explorer ↗
                </a>
              )}
            </>
          ) : (
            <p className="text-stone-500">{verifyEntry.data.reason ?? "On-chain validation unavailable."}</p>
          )}
        </div>
      )}
    </div>
  );
}
