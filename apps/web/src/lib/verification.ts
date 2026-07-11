import type { AgentSignal, OnChainVerifyData } from "../types";

export function getOnchainVerifyTarget(signal: AgentSignal | null) {
  const fixtureId = signal?.evidence?.fixtureId;
  const sequence = signal?.evidence?.scoresContext?.sequence;

  if (!fixtureId || !sequence) return null;

  return { fixtureId, sequence };
}

export function getVerificationDepth(
  signal: AgentSignal | null,
  verifyState: Record<string, { loading: boolean; data: OnChainVerifyData | null }>
): { label: string; tone: "neutral" | "warn" | "danger" | "success" } | null {
  const target = getOnchainVerifyTarget(signal);
  if (!target) return null;

  const key = `${target.fixtureId}-${target.sequence}`;
  const entry = verifyState[key];

  if (entry?.loading) {
    return { label: "Checking on-chain...", tone: "neutral" };
  }

  if (!entry?.data) {
    return { label: "Not yet verified", tone: "neutral" };
  }

  if (!entry.data.available) {
    return {
      label: `Verification unavailable — ${entry.data.reason ?? "unknown reason"}`,
      tone: "warn",
    };
  }

  if (!entry.data.isValid) {
    return { label: "Verification FAILED", tone: "danger" };
  }

  return { label: "On-chain verified", tone: "success" };
}
