import { Fingerprint, Link2, ShieldCheck } from "lucide-react";
import { VerificationReceipt } from "../../components/VerificationReceipt";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { formatTime, getSignalTarget, getSignalType, signalTypeLabel } from "../../lib/formatters";
import type { AgentSignal } from "../../types";
import { VerificationEvidenceChain } from "./VerificationEvidenceChain";
import { VerificationObjectQueue } from "./VerificationObjectQueue";
import {
  getVerificationObjectStatus,
  selectVerificationObject,
  summarizeVerificationObjects,
  type OnchainVerifyState,
  type VerificationObject,
} from "./verificationWorkspaceModel";

export interface VerificationPageProps {
  verificationObjects: VerificationObject[];
  selectedSignal: AgentSignal | null;
  onSelectSignal: (signal: AgentSignal) => void;
  onchainVerify: OnchainVerifyState;
  onVerify: (signal: AgentSignal | null) => void;
}

const TRUST_DEFINITIONS = [
  {
    title: "Local audit fingerprint",
    detail:
      "A SHA-256 hash computed from the local audit dataset. It is tamper-evident only when compared with another copy and is not itself posted to Solana.",
  },
  {
    title: "Solana Merkle validation",
    detail:
      "An independent Solana mainnet check of the underlying TxLINE stat using its fixture and exact event sequence.",
  },
  {
    title: "Simulation receipt",
    detail:
      "Entry odds, units, risk checks, and settlement for a paper position. It never represents a real trade.",
  },
  {
    title: "Unavailable proof",
    detail:
      "A named missing boundary or validator reason. GoalPulse never infers or fabricates a verification result.",
  },
];

export function VerificationPage({
  verificationObjects,
  selectedSignal,
  onSelectSignal,
  onchainVerify,
  onVerify,
}: VerificationPageProps) {
  const summary = summarizeVerificationObjects(verificationObjects, onchainVerify);
  const activeObject = selectVerificationObject(verificationObjects, selectedSignal);
  const activeStatus = activeObject
    ? getVerificationObjectStatus(activeObject, onchainVerify)
    : null;
  const summaryMetrics = [
    { label: "Objects", value: summary.total, tone: "text-white" },
    { label: "On-chain eligible", value: summary.eligible, tone: "text-info" },
    { label: "Local fingerprints", value: summary.fingerprints, tone: "text-proof-200" },
    { label: "Verified this session", value: summary.verified, tone: "text-positive" },
  ];

  return (
    <div className="min-w-0 space-y-4 overflow-x-clip">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-proof-200">
            Trust workspace
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Verification Evidence Desk
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-400">
            Trace each signal from source evidence to an independent Solana mainnet check.
          </p>
        </div>
        <p className="font-mono text-xs tabular-nums text-stone-300" aria-live="polite">
          {summary.total} {summary.total === 1 ? "object" : "objects"}
        </p>
      </header>

      <section
        aria-label="Verification summary"
        className="grid grid-cols-2 border-y border-border bg-surface-2 sm:grid-cols-4"
      >
        {summaryMetrics.map((metric) => (
          <div key={metric.label} className="min-w-0 border-border p-3 odd:border-r sm:border-r sm:last:border-r-0">
            <p className="text-[11px] text-stone-400">{metric.label}</p>
            <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${metric.tone}`}>
              {metric.value}
            </p>
          </div>
        ))}
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-12 xl:items-start">
        <Card className="min-w-0 overflow-hidden xl:col-span-4">
          <div className="flex items-start justify-between gap-3 border-b border-border p-3 sm:p-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-500">
                Evidence queue
              </p>
              <h2 className="mt-1 text-sm font-semibold text-white">Verification objects</h2>
            </div>
            <Link2 className="h-4 w-4 text-proof-200" aria-hidden="true" />
          </div>
          {verificationObjects.length > 0 ? (
            <VerificationObjectQueue
              items={verificationObjects}
              selectedSignal={activeObject?.signal ?? null}
              verifyState={onchainVerify}
              onSelect={onSelectSignal}
            />
          ) : (
            <p className="p-4 text-xs leading-5 text-stone-500">No objects in the recent queue yet.</p>
          )}
        </Card>

        <Card
          id="guide-verification-receipt"
          role="region"
          aria-label="Selected proof inspector"
          elevated
          className="min-w-0 p-4 sm:p-5 xl:col-span-8"
        >
          {activeObject ? (
            <>
              <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-proof-200/80">
                    Selected proof object
                  </p>
                  <h2 className="mt-1 truncate text-lg font-bold text-white">
                    {activeObject.signal.match ?? "Selected signal"}
                  </h2>
                  <p className="mt-1 text-xs text-stone-400">
                    {getSignalTarget(activeObject.signal)} | {signalTypeLabel(getSignalType(activeObject.signal))} | {formatTime(activeObject.signal.createdAt)}
                  </p>
                </div>
                {activeStatus && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-proof/25 bg-proof/10 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-proof-100">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {activeStatus.label}
                  </span>
                )}
              </div>

              {activeObject.proofHash && (
                <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-proof/20 bg-proof/5 px-3 py-2 text-[10px] text-proof-200">
                  <Fingerprint className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="shrink-0 font-semibold">Local fingerprint</span>
                  <span className="truncate font-mono">{activeObject.proofHash}</span>
                </div>
              )}

              <VerificationEvidenceChain item={activeObject} verifyState={onchainVerify} />
              <div className="mt-4 border-t border-border pt-4">
                <VerificationReceipt
                  variant="workspace"
                  selectedSignal={activeObject.signal}
                  onchainVerify={onchainVerify}
                  onVerify={onVerify}
                />
              </div>
            </>
          ) : (
            <EmptyState reason="Verification objects appear after the live monitor or Replay Lab generates a signal." />
          )}
        </Card>
      </div>

      <section aria-labelledby="trust-model-title">
        <div className="mb-2 flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-proof-200" aria-hidden="true" />
          <h2 id="trust-model-title" className="text-sm font-semibold text-white">Trust model</h2>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {TRUST_DEFINITIONS.map((item) => (
            <details key={item.title} className="group rounded-lg border border-border bg-surface-2 p-3">
              <summary className="min-h-11 cursor-pointer list-none py-3 text-xs font-semibold text-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-proof/60">
                {item.title}
              </summary>
              <p className="pb-2 text-xs leading-5 text-stone-400">{item.detail}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
