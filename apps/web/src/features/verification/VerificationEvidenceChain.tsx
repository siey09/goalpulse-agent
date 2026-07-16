import { Database, Fingerprint, Radio, ShieldCheck } from "lucide-react";
import { getSignalTarget, getSignalType, signalTypeLabel } from "../../lib/formatters";
import { getOnchainVerifyTarget } from "../../lib/verification";
import {
  getVerificationObjectStatus,
  type OnchainVerifyState,
  type VerificationObject,
} from "./verificationWorkspaceModel";

interface VerificationEvidenceChainProps {
  item: VerificationObject;
  verifyState: OnchainVerifyState;
}

export function VerificationEvidenceChain({ item, verifyState }: VerificationEvidenceChainProps) {
  const target = getOnchainVerifyTarget(item.signal);
  const status = getVerificationObjectStatus(item, verifyState);
  const fingerprint = item.proofHash
    ? `${item.proofHash.slice(0, 12)}...${item.proofHash.slice(-6)}`
    : null;
  const nodes = [
    {
      label: "Source record",
      value: item.source,
      detail: fingerprint
        ? `Local SHA-256 fingerprint ${fingerprint}`
        : "Source metadata retained with the signal.",
      icon: Radio,
      tone: "text-info",
    },
    {
      label: "Signal decision",
      value: getSignalTarget(item.signal),
      detail: signalTypeLabel(getSignalType(item.signal)),
      icon: Fingerprint,
      tone: "text-proof-200",
    },
    {
      label: "TXODDS stat target",
      value: target ? `Fixture ${target.fixtureId} | Sequence ${target.sequence}` : "Not verifiable",
      detail: target
        ? "Exact fixture and event sequence required by the validator."
        : "No exact TXODDS sequence is attached to this signal.",
      icon: Database,
      tone: target ? "text-accent-200" : "text-stone-500",
    },
    {
      label: "Solana mainnet validation",
      value: status.label,
      detail:
        status.reason ??
        (status.kind === "verified"
          ? "The referenced stat passed independent Merkle validation."
          : status.kind === "failed"
            ? "The referenced stat did not pass validation."
            : "Run the live check to resolve this verification state."),
      icon: ShieldCheck,
      tone:
        status.kind === "verified"
          ? "text-positive"
          : status.kind === "failed"
            ? "text-danger"
            : status.kind === "unavailable"
              ? "text-warning"
              : "text-info",
    },
  ];

  return (
    <ol aria-label="Proof chain" className="mt-4">
      {nodes.map((node, index) => {
        const Icon = node.icon;
        const isLast = index === nodes.length - 1;

        return (
          <li key={node.label} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
            {!isLast && (
              <span
                className="absolute bottom-0 left-[0.97rem] top-8 w-px bg-gradient-to-b from-proof/50 to-border"
                aria-hidden="true"
              />
            )}
            <span className={`z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-3 ${node.tone}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 rounded-lg border border-border/80 bg-black/15 px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-500">{node.label}</p>
              <p className="mt-1 break-words text-sm font-semibold text-white">{node.value}</p>
              <p className="mt-1 break-words text-xs leading-5 text-stone-400">{node.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
