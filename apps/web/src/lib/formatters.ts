import type { AgentSignal, Match } from "../types";

export function formatNumber(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "0";
  return value.toLocaleString();
}

export function formatPercent(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "0%";
  return `${Math.round(value)}%`;
}

export function formatOdds(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "--";
  return value.toFixed(2);
}

export function formatTime(value?: string) {
  if (!value) return "Waiting";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Waiting";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function severityMarkerStyle(severity?: string) {
  if (severity === "HIGH") return { fill: "#ff6161", radius: 7 };
  if (severity === "MEDIUM") return { fill: "#f2c14e", radius: 5.5 };
  return { fill: "#7c8ba1", radius: 4 };
}

export function getOdds(match?: Match) {
  return match?.market ?? match?.odds ?? {};
}

export function severityStyle(severity?: string) {
  const value = (severity ?? "LOW").toUpperCase();

  if (value === "HIGH") return "bg-danger-500/15 text-danger-200 border-danger/20";
  if (value === "MEDIUM") return "bg-accent/15 text-accent-200 border-accent/20";

  return "bg-positive-500/15 text-positive-200 border-positive/20";
}

function statusLabel(status?: string) {
  if (!status) return "WAITING";
  return status.toUpperCase();
}

export function preciseStatusLabel(match?: Match) {
  const rawLabel = match?.statusLabel?.trim();
  const normalizedLabel = rawLabel?.toLowerCase();

  if (rawLabel && normalizedLabel !== "scheduled") {
    return rawLabel.toUpperCase();
  }

  if (match?.status === "scheduled") return "PRE-MATCH";
  if (match?.status === "live") return "LIVE";
  if (match?.status === "finished") return "FINISHED";

  return statusLabel(match?.status);
}

export function matchClockLabel(match?: Match) {
  if (!match) return "—";

  if (match.status === "scheduled") {
    return match.statusLabel ?? "Pre-match";
  }

  if (match.status === "finished") {
    const finishedLabel = match.statusLabel?.trim();
    return finishedLabel && finishedLabel.toLowerCase() !== "scheduled"
      ? finishedLabel
      : "Final";
  }

  return match.clockLabel ?? `${match.minute ?? 0}'`;
}

export function dataFreshnessLabel(lastUpdated?: string) {
  if (!lastUpdated) return null;

  const updatedMs = new Date(lastUpdated).getTime();

  if (Number.isNaN(updatedMs)) return null;

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - updatedMs) / 1000));

  if (elapsedSeconds < 60) {
    return `updated ${elapsedSeconds}s ago`;
  }

  if (elapsedSeconds < 3600) {
    return `updated ${Math.floor(elapsedSeconds / 60)}m ago`;
  }

  return `updated ${Math.floor(elapsedSeconds / 3600)}h ago`;
}

export function matchStatusTone(match?: Match) {
  const label = `${match?.statusLabel ?? ""}`.toLowerCase();

  if (label.includes("suspended") || label.includes("interrupted")) {
    return "bg-warning/15 text-warning-200";
  }

  if (label.includes("cancelled") || label.includes("abandoned")) {
    return "bg-danger/15 text-danger-200";
  }

  if (match?.status === "live") {
    return "bg-positive/15 text-positive-200";
  }

  if (match?.status === "scheduled") {
    return "bg-info/15 text-info-200";
  }

  if (match?.status === "finished") {
    return "bg-stone-400/15 text-stone-300";
  }

  return "bg-white/8 text-stone-300";
}

export function signalTypeLabel(type?: string) {
  return (type ?? "WATCH").replaceAll("_", " ");
}

export function marketTypeLabel(marketType?: string) {
  if (marketType === "OVERUNDER_PARTICIPANT_GOALS") return "Over/Under";
  if (marketType === "1X2_PARTICIPANT_RESULT") return "1X2";
  return undefined;
}

export function discordAlertBadge(status?: "sent" | "failed" | "not_configured") {
  if (status === "sent") {
    return { label: "🔔 Alert sent", className: "border-positive/20 bg-positive/10 text-positive-200" };
  }
  if (status === "failed") {
    return { label: "⚠ Alert failed", className: "border-warning/20 bg-warning/10 text-warning-200" };
  }
  if (status === "not_configured") {
    return { label: "Alerts off", className: "border-border bg-white/5 text-stone-400" };
  }
  return undefined;
}

export function getSignalType(signal?: AgentSignal | null) {
  return signal?.type ?? signal?.signalType ?? "WATCH";
}

export function getSignalTarget(signal?: AgentSignal | null) {
  return signal?.team ?? signal?.target ?? signal?.side ?? "Market side";
}

export function formatOddsChange(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "Calculated by engine";
  return `${value.toFixed(2)}%`;
}

export function getThresholdLabel(signal?: AgentSignal | null) {
  const severity = (signal?.severity ?? "LOW").toUpperCase();

  if (severity === "HIGH") return "Sharp movement threshold crossed: >= 15%";
  if (severity === "MEDIUM") return "Momentum shift threshold crossed: >= 8%";

  return "Watch threshold crossed: >= 4%";
}

export function getSignalOutcome(signal?: AgentSignal | null) {
  return (signal?.resultStatus ?? "pending").toUpperCase();
}

export function impliedProbabilityPct(odds?: number) {
  if (odds === undefined || Number.isNaN(odds) || odds <= 0) return "—";
  return `${((1 / odds) * 100).toFixed(1)}%`;
}

export function formatProbabilityPointShift(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "Not reported separately";
  return `${value.toFixed(2)} pp`;
}

export function reliabilityTone(reliability?: string) {
  if (reliability === "RELIABLE") return "border-positive/20 bg-positive/10 text-positive-200";
  if (reliability === "UNRELIABLE" || reliability === "SUSPENDED") return "border-danger/20 bg-danger/10 text-danger-200";
  return "border-border bg-white/5 text-stone-400";
}
