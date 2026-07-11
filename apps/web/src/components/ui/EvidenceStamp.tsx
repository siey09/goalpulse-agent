import type { ReactNode } from "react";
import { Radio } from "lucide-react";

export type EvidenceStampTone = "accent" | "positive" | "warning" | "danger" | "info" | "proof" | "neutral";

const TONE_TEXT: Record<EvidenceStampTone, string> = {
  accent: "text-accent-soft",
  positive: "text-positive",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  proof: "text-proof",
  neutral: "text-stone-400",
};

export interface EvidenceStampProps {
  /** The deterministic rule this panel's claim rests on, e.g. "SHARP MOVE >= 15%". */
  rule: ReactNode;
  /** The observed value that crossed the rule, e.g. "+28.68%". Omit if there's nothing to measure yet. */
  delta?: ReactNode;
  /** A traceable reference - fixture id, message id, signal id. Omit if nothing has fired yet. */
  reference?: ReactNode;
  tone?: EvidenceStampTone;
}

/**
 * The recurring "this claim is falsifiable" strip every restyled panel
 * ends on: rule crossed -> observed delta -> traceable reference,
 * always in that order, always monospace. Not decoration - it's the
 * literal shape of what GoalPulse actually promises (deterministic
 * thresholds, evidence-backed, never a black box), so every panel says
 * it the same way instead of each one inventing its own "how do I
 * show my evidence" layout.
 */
export function EvidenceStamp({ rule, delta, reference, tone = "neutral" }: EvidenceStampProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-stone-500">
      <Radio className={`h-3 w-3 shrink-0 ${TONE_TEXT[tone]}`} aria-hidden="true" />
      <span className={TONE_TEXT[tone]}>{rule}</span>
      {delta !== undefined && (
        <>
          <span className="text-stone-700">·</span>
          <span className="text-stone-300">{delta}</span>
        </>
      )}
      {reference !== undefined && (
        <>
          <span className="text-stone-700">·</span>
          <span className="normal-case tracking-normal text-stone-500">{reference}</span>
        </>
      )}
    </div>
  );
}
