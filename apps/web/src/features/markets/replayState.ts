export type ReplayStatus = "live" | "playing" | "paused" | "complete";
export type ReplaySpeed = 0.5 | 1 | 2;
export type ReplayInterval = 2000 | 1000 | 500;

export function replayIntervalForSpeed(speed: ReplaySpeed): ReplayInterval {
  if (speed === 0.5) return 2000;
  if (speed === 2) return 500;
  return 1000;
}

const replayTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

export function replayProgressLabel(input: {
  status: ReplayStatus;
  cursor: number;
  total: number;
  originalTimestamp?: string;
  intervalMs: number;
}): string {
  const cursor = Math.max(0, Math.min(input.cursor, input.total));
  const total = Math.max(0, input.total);

  if (input.status === "live") return "Live feed";
  if (input.status === "paused") return `Paused at snapshot ${cursor} of ${total}`;
  if (input.status === "complete") return `Replay complete · ${total} real snapshots`;

  const parsedTimestamp = input.originalTimestamp ? Date.parse(input.originalTimestamp) : Number.NaN;
  const historicalTime = Number.isNaN(parsedTimestamp)
    ? "time unavailable"
    : replayTimeFormatter.format(new Date(parsedTimestamp));
  const rate = 1000 / input.intervalMs;
  const rateLabel = Number.isInteger(rate) ? String(rate) : rate.toFixed(1);
  const noun = rate === 1 ? "snapshot" : "snapshots";

  return `Snapshot ${cursor} of ${total} · Historical ${historicalTime} · ${rateLabel} ${noun}/s`;
}
