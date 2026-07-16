export type CompositionTone = "positive" | "danger" | "warning" | "info" | "neutral";

export interface CompositionItem {
  id: string;
  label: string;
  count: number;
  tone: CompositionTone;
}

export interface CompositionSegment extends CompositionItem {
  percent: number;
}

export interface SignalOutcomeSummary {
  confirmed: number;
  rejected: number;
  pending: number;
  strategyAccuracy: number | null;
}

export interface FixturePipelineSummary {
  live: number;
  upcoming: number;
  finished: number;
}

export interface CommandCenterPnlSummary {
  netUnits: number;
  roiPercent: number;
  openPositions: number;
  openExposure: number;
  settledBets: number;
}

export function toCompositionSegments(items: CompositionItem[]): {
  total: number;
  segments: CompositionSegment[];
} {
  const normalized = items.map((item) => ({ ...item, count: Math.max(0, item.count) }));
  const total = normalized.reduce((sum, item) => sum + item.count, 0);

  return {
    total,
    segments: normalized.map((item) => ({
      ...item,
      percent: total === 0 ? 0 : (item.count / total) * 100,
    })),
  };
}

export function toRoiGeometry(value: number, values: number[]): {
  direction: "positive" | "negative" | "neutral";
  widthPercent: number;
} {
  const extent = Math.max(1, ...values.map((current) => Math.abs(current)));

  return {
    direction: value > 0 ? "positive" : value < 0 ? "negative" : "neutral",
    widthPercent: (Math.abs(value) / extent) * 100,
  };
}
