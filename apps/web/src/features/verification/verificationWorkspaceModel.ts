import { getOnchainVerifyTarget } from "../../lib/verification";
import type { AgentSignal, OnChainVerifyData, ReplayBacktest } from "../../types";

export interface VerificationObject {
  signal: AgentSignal;
  source: string;
  proofHash?: string;
}

export type VerificationObjectStatusKind =
  | "checking"
  | "ready"
  | "verified"
  | "failed"
  | "unavailable"
  | "no_sequence";

export interface VerificationObjectStatus {
  kind: VerificationObjectStatusKind;
  label: string;
  reason?: string;
}

export type OnchainVerifyState = Record<
  string,
  { loading: boolean; data: OnChainVerifyData | null }
>;

export function buildVerificationObjects(
  liveSignals: AgentSignal[],
  replayBacktest: ReplayBacktest | null,
  limit = 5
): VerificationObject[] {
  const replayItems: VerificationObject[] = (replayBacktest?.signals ?? []).map((signal) => ({
    signal,
    source: "TxLINE replay audit",
    proofHash: replayBacktest?.proof?.hash,
  }));
  const liveItems: VerificationObject[] = liveSignals.map((signal) => ({
    signal,
    source: "Live monitor",
  }));
  const seenIds = new Set<string>();
  const uniqueItems = [...replayItems, ...liveItems].filter(({ signal }) => {
    if (!signal.id) return true;
    if (seenIds.has(signal.id)) return false;
    seenIds.add(signal.id);
    return true;
  });

  return uniqueItems
    .map((item, index) => ({
      item,
      index,
      priority: getOnchainVerifyTarget(item.signal) ? 0 : item.proofHash ? 1 : 2,
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map(({ item }) => item);
}

export function getVerificationObjectStatus(
  item: VerificationObject,
  state: OnchainVerifyState
): VerificationObjectStatus {
  const target = getOnchainVerifyTarget(item.signal);

  if (!target) {
    return { kind: "no_sequence", label: "No sequence" };
  }

  const entry = state[`${target.fixtureId}-${target.sequence}`];

  if (entry?.loading) {
    return { kind: "checking", label: "Checking" };
  }

  if (!entry?.data) {
    return { kind: "ready", label: "Ready to verify" };
  }

  if (!entry.data.available) {
    return {
      kind: "unavailable",
      label: "Unavailable",
      reason: entry.data.reason,
    };
  }

  if (!entry.data.isValid) {
    return { kind: "failed", label: "Failed" };
  }

  return { kind: "verified", label: "Verified" };
}

export function summarizeVerificationObjects(
  items: VerificationObject[],
  state: OnchainVerifyState
) {
  return {
    total: items.length,
    eligible: items.filter(({ signal }) => Boolean(getOnchainVerifyTarget(signal))).length,
    fingerprints: items.filter(({ proofHash }) => Boolean(proofHash)).length,
    verified: items.filter(
      (item) => getVerificationObjectStatus(item, state).kind === "verified"
    ).length,
  };
}

export function selectVerificationObject(
  items: VerificationObject[],
  selected: AgentSignal | null
): VerificationObject | null {
  if (selected) {
    return (
      items.find(
        ({ signal }) =>
          signal === selected || Boolean(signal.id && signal.id === selected.id)
      ) ?? { signal: selected, source: "Selected signal" }
    );
  }

  return items[0] ?? null;
}
