import {
  BadgeCheck,
  CircleAlert,
  CircleX,
  Clock3,
  Fingerprint,
  Link2Off,
  LoaderCircle,
} from "lucide-react";
import { formatTime, getSignalTarget, getSignalType, signalTypeLabel } from "../../lib/formatters";
import type { AgentSignal } from "../../types";
import {
  getVerificationObjectStatus,
  type OnchainVerifyState,
  type VerificationObject,
  type VerificationObjectStatusKind,
} from "./verificationWorkspaceModel";

interface VerificationObjectQueueProps {
  items: VerificationObject[];
  selectedSignal: AgentSignal | null;
  verifyState: OnchainVerifyState;
  onSelect: (signal: AgentSignal) => void;
}

const STATUS_STYLE: Record<
  VerificationObjectStatusKind,
  { icon: typeof BadgeCheck; className: string }
> = {
  verified: { icon: BadgeCheck, className: "text-positive" },
  failed: { icon: CircleX, className: "text-danger" },
  unavailable: { icon: CircleAlert, className: "text-warning" },
  checking: { icon: LoaderCircle, className: "text-info" },
  ready: { icon: Clock3, className: "text-info" },
  no_sequence: { icon: Link2Off, className: "text-stone-500" },
};

export function VerificationObjectQueue({
  items,
  selectedSignal,
  verifyState,
  onSelect,
}: VerificationObjectQueueProps) {
  return (
    <ul aria-label="Verification objects" className="divide-y divide-border">
      {items.map((item) => {
        const status = getVerificationObjectStatus(item, verifyState);
        const statusStyle = STATUS_STYLE[status.kind];
        const StatusIcon = statusStyle.icon;
        const selected =
          item.signal === selectedSignal ||
          Boolean(item.signal.id && item.signal.id === selectedSignal?.id);

        return (
          <li key={item.signal.id ?? `${item.source}-${item.signal.match ?? "unknown"}-${item.signal.createdAt ?? "undated"}`}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(item.signal)}
              className={`min-h-11 w-full px-3 py-3 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-proof/70 ${
                selected
                  ? "bg-proof/10 shadow-[inset_2px_0_0_var(--color-proof)]"
                  : "hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {item.signal.match ?? "Unknown match"}
                  </p>
                  <p className="mt-1 truncate text-xs text-stone-400">
                    {getSignalTarget(item.signal)} | {signalTypeLabel(getSignalType(item.signal))}
                  </p>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] ${statusStyle.className}`}
                >
                  <StatusIcon
                    className={`h-3.5 w-3.5 ${status.kind === "checking" ? "motion-safe:animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {status.label}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[9px] text-stone-500">
                <span className="truncate">{item.source}</span>
                {item.proofHash ? (
                  <span className="flex shrink-0 items-center gap-1 text-proof-200">
                    <Fingerprint className="h-3 w-3" aria-hidden="true" />
                    Fingerprint linked
                  </span>
                ) : (
                  <span className="shrink-0">{formatTime(item.signal.createdAt)}</span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
